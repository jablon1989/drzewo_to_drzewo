data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# Photos bucket. Key layout:
#   photos/<photo-id>.jpg   max 2048px, resized in the browser (no EXIF/GPS)
#   thumbs/<photo-id>.jpg   max 480px, for lists and the map
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "photos" {
  bucket = "${var.name}-photos-${data.aws_caller_identity.current.account_id}"

  # Aura's photos: Terraform refuses to delete this bucket.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_ownership_controls" "photos" {
  bucket = aws_s3_bucket.photos.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "photos" {
  bucket                  = aws_s3_bucket.photos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "photos" {
  bucket = aws_s3_bucket.photos.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id

  # Deleted/overwritten files stay recoverable for a while, then go away.
  rule {
    id     = "expire-noncurrent"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_retention_days
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# The browser uploads straight to S3 with presigned URLs, so allow our site.
resource "aws_s3_bucket_cors_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id
  cors_rule {
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = var.allowed_origins
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

resource "aws_s3_bucket_policy" "photos" {
  bucket = aws_s3_bucket.photos.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.photos.arn, "${aws_s3_bucket.photos.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.photos]
}

# ---------------------------------------------------------------------------
# Game tables
# ---------------------------------------------------------------------------

# One item per photo of Aura at a tree: tree_id + "<time>#<photo-id>".
# Query by tree for the tree page; the map scans the (small) table.
resource "aws_dynamodb_table" "finds" {
  name         = "${var.name}-finds"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tree_id"
  range_key    = "find_id"

  attribute {
    name = "tree_id"
    type = "S"
  }

  attribute {
    name = "find_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  deletion_protection_enabled = true

  # Turning on PITR for a brand-new table can take AWS well over the default
  # 20 minutes ("Backups are being enabled… retry later").
  timeouts {
    create = "60m"
    update = "60m"
  }
}

# Hidden trees ("find the tree in this photo"), with guesses and hints inside.
resource "aws_dynamodb_table" "challenges" {
  name         = "${var.name}-challenges"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "challenge_id"

  attribute {
    name = "challenge_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  deletion_protection_enabled = true

  # Turning on PITR for a brand-new table can take AWS well over the default
  # 20 minutes ("Backups are being enabled… retry later").
  timeouts {
    create = "60m"
    update = "60m"
  }
}
