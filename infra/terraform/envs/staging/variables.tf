variable "aws_region" {
  description = "AWS region."
  type        = string
  default     = "ap-southeast-2"
}

variable "vpc_id" {
  description = "VPC id."
  type        = string
}

variable "subnet_id" {
  description = "Public subnet id."
  type        = string
}

variable "key_name" {
  description = "Existing EC2 key pair name."
  type        = string
}

variable "allowed_ssh_cidrs" {
  description = "CIDR blocks allowed to SSH."
  type        = list(string)
}

variable "public_http_cidrs" {
  description = "CIDR blocks allowed to reach HTTP/HTTPS. Use Cloudflare IP ranges for proxied domains."
  type        = list(string)
}
