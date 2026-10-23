variable "name" {
  description = "Name prefix for resources."
  type        = string
}

variable "allowed_origins" {
  description = "Web origins allowed to upload to the photos bucket (CORS)."
  type        = list(string)
}

variable "noncurrent_retention_days" {
  description = "Days to keep deleted/overwritten file versions."
  type        = number
  default     = 30
}
