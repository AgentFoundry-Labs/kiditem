# KidItem Terraform Baseline

This directory is the IaC baseline for the single-host Docker Compose runtime.
It is intentionally small: one reusable EC2 host module and environment entry
points for staging and production.

## Layout

```text
infra/terraform/
  modules/single-host/       # EC2, security group, Docker/nginx bootstrap
  envs/staging/              # staging instantiation
  envs/production/           # production instantiation
```

## Operator Flow

```bash
cd infra/terraform/envs/staging
terraform init
terraform plan \
  -var='vpc_id=vpc-...' \
  -var='subnet_id=subnet-...' \
  -var='key_name=kiditem-staging' \
  -var='allowed_ssh_cidrs=["<operator-ip>/32"]' \
  -var='public_http_cidrs=["<cloudflare-ip-range>"]'
```

Production uses the same module from `envs/production` with production-specific
state, CIDRs, key pair, and tags.

The single-host module allocates an Elastic IP by default so Cloudflare DNS does
not depend on an EC2 auto-assigned public IP. Keep SSH CIDRs narrow and use
Cloudflare's current IP ranges for HTTP/HTTPS when the domain is proxied.

Do not commit Terraform state, generated plans, private keys, or tfvars files
with secrets.
