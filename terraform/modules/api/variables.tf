variable "name" {
  description = "Name prefix for resources."
  type        = string
}

variable "source_dir" {
  description = "Folder with the API Lambda code (*.py)."
  type        = string
}

variable "trees_file" {
  description = "Path to data/trees.json; packaged next to the handler."
  type        = string
}

variable "jwt_issuer" {
  description = "Cognito issuer URL."
  type        = string
}

variable "jwt_audience" {
  description = "Cognito app client id."
  type        = string
}

variable "photos_bucket_name" {
  type = string
}

variable "photos_bucket_arn" {
  type = string
}

variable "finds_table_name" {
  type = string
}

variable "finds_table_arn" {
  type = string
}

variable "challenges_table_name" {
  type = string
}

variable "challenges_table_arn" {
  type = string
}

variable "log_retention_days" {
  type    = number
  default = 30
}


variable "notify_from" {
  description = "Sender of the game's e-mails, e.g. \"Drzewo to Drzewo <game@pusiaczkowo.pl>\". Empty = no e-mails."
  type        = string
  default     = ""
}

variable "site_url" {
  description = "The game's address, for links in e-mails."
  type        = string
}

variable "user_pool_id" {
  description = "Shared user pool: the API lists its users to know the players and their e-mails."
  type        = string
}

variable "user_pool_arn" {
  type = string
}
