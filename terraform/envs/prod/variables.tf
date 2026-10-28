variable "project" {
  type    = string
  default = "park-game"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "region" {
  type    = string
  default = "eu-central-1"
}

variable "alert_email" {
  description = "E-mail for alarms and budget alerts."
  type        = string
  sensitive   = true
}

variable "monthly_budget_usd" {
  type    = number
  default = 5
}

variable "enable_local_dev" {
  description = "Allow logins from http://localhost:5173 (npm run dev)."
  type        = bool
  default     = true
}

variable "domain_name" {
  description = "Own hostname for the game. null = only the *.cloudfront.net address."
  type        = string
  default     = "park.pusiaczkowo.pl"
}

variable "domain_zone" {
  description = "Shared Route 53 zone + wildcard certificate (managed in jablon1989/aura-the-husky, terraform/)."
  type        = string
  default     = "pusiaczkowo.pl"
}

variable "notify_from" {
  description = "Sender of the game's e-mails (domain verified in SES by jablon1989/aura-the-husky). null = no e-mails."
  type        = string
  default     = "Drzewo to Drzewo <game@pusiaczkowo.pl>"
}


variable "user_pool_name" {
  description = "The shared login of pusiaczkowo.pl (jablon1989/aura-the-husky, terraform/login.tf)."
  type        = string
  default     = "aurathehusky-users"
}
