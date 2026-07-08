output "instance_id" {
  description = "EC2 instance id."
  value       = aws_instance.this.id
}

output "public_ip" {
  description = "Public IPv4 address."
  value       = var.allocate_elastic_ip ? aws_eip.this[0].public_ip : aws_instance.this.public_ip
}

output "elastic_ip_allocation_id" {
  description = "Elastic IP allocation id when enabled."
  value       = var.allocate_elastic_ip ? aws_eip.this[0].allocation_id : null
}

output "security_group_id" {
  description = "Security group id."
  value       = aws_security_group.this.id
}
