module "kiditem_staging_host" {
  source = "../../modules/single-host"

  name              = "kiditem-staging"
  vpc_id            = var.vpc_id
  subnet_id         = var.subnet_id
  key_name          = var.key_name
  allowed_ssh_cidrs = var.allowed_ssh_cidrs
  public_http_cidrs = var.public_http_cidrs

  tags = {
    Environment = "staging"
  }
}
