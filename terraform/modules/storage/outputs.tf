output "photos_bucket_name" {
  value = aws_s3_bucket.photos.id
}

output "photos_bucket_arn" {
  value = aws_s3_bucket.photos.arn
}

output "finds_table_name" {
  value = aws_dynamodb_table.finds.name
}

output "finds_table_arn" {
  value = aws_dynamodb_table.finds.arn
}

output "challenges_table_name" {
  value = aws_dynamodb_table.challenges.name
}

output "challenges_table_arn" {
  value = aws_dynamodb_table.challenges.arn
}
