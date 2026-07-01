output "public_ip" {
  description = "Staging host public IP."
  value       = module.kiditem_staging_host.public_ip
}

output "elastic_ip_allocation_id" {
  description = "Staging Elastic IP allocation id."
  value       = module.kiditem_staging_host.elastic_ip_allocation_id
}
