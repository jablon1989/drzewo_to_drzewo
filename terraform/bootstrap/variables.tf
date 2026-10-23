variable "project" {
  description = "Short project name used in resource names."
  type        = string
  default     = "park-game"
}

variable "region" {
  description = "AWS region for the project."
  type        = string
  default     = "eu-central-1"
}

variable "github_repository" {
  description = "GitHub repository allowed to deploy, as owner/name."
  type        = string
  default     = "jablon1989/park_game"
}

variable "github_sub_prefix" {
  description = <<-EOT
    Start of the GitHub OIDC token "sub" claim. Default: "repo:<owner>/<name>".
    Repos using GitHub's immutable subject format send "repo:<owner>@<id>/<name>@<id>" instead –
    see: gh api repos/<owner>/<name>/actions/oidc/customization/sub (sub_claim_prefix).
  EOT
  type        = string
  # This repo uses the immutable format (gh api repos/jablon1989/park_game/actions/oidc/customization/sub).
  default = "repo:jablon1989@89132335/park_game@1427470045"
}

variable "github_environment" {
  description = "GitHub Actions environment whose jobs may apply changes."
  type        = string
  default     = "prod"
}

variable "create_github_oidc_provider" {
  description = "The account already has the GitHub OIDC provider (created by aura-the-husky), so reuse it by default."
  type        = bool
  default     = false
}
