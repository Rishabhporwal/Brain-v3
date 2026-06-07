terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
  # Remote state — created at apply time (S3 + DynamoDB lock). For `terraform validate` run with
  # `-backend=false` so no AWS calls are made and nothing is provisioned.
  # backend "s3" {
  #   bucket         = "brain-tfstate-668848431102-ap-south-1"
  #   key            = "staging/terraform.tfstate"
  #   region         = "ap-south-1"
  #   dynamodb_table = "brain-tflock"
  #   encrypt        = true
  # }
}
