variable "name" {
  description = "Name prefix for the KidItem host resources."
  type        = string
}

variable "vpc_id" {
  description = "VPC id for the host security group."
  type        = string
}

variable "subnet_id" {
  description = "Public subnet id for the host."
  type        = string
}

variable "key_name" {
  description = "Existing EC2 key pair name."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type."
  type        = string
  default     = "t3.small"
}

variable "root_volume_size_gb" {
  description = "Root volume size in GiB."
  type        = number
  default     = 40
}

variable "ami_id" {
  description = "Optional AMI id. Defaults to latest Ubuntu 24.04 amd64."
  type        = string
  default     = ""
}

variable "allowed_ssh_cidrs" {
  description = "CIDR blocks allowed to SSH to the host."
  type        = list(string)
}

variable "public_http_cidrs" {
  description = "CIDR blocks allowed to reach HTTP/HTTPS."
  type        = list(string)
}

variable "allocate_elastic_ip" {
  description = "Whether to allocate and associate an Elastic IP for stable DNS targets."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags added to all resources."
  type        = map(string)
  default     = {}
}
