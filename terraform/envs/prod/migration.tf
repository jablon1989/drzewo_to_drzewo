# Moving to the shared pusiaczkowo.pl login (one user pool for all apps).
# The game's own user pool, its login domain and users are no longer managed
# here. Terraform forgets them without deleting anything (the pool has deletion
# protection anyway). Delete the old pool by hand once the new login works
# (see README → "Login"). These blocks can go after that.
removed {
  from = module.auth.aws_cognito_user_pool.this

  lifecycle {
    destroy = false
  }
}

removed {
  from = module.auth.aws_cognito_user_pool_domain.this

  lifecycle {
    destroy = false
  }
}

removed {
  from = module.auth.aws_cognito_user.this

  lifecycle {
    destroy = false
  }
}

# The players' SES address confirmations moved to the shared stack too
# (aura-the-husky terraform/login.tf adopts them). Forget, don't delete.
removed {
  from = aws_sesv2_email_identity.player

  lifecycle {
    destroy = false
  }
}
