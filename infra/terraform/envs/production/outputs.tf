output "public_ip" {
  description = "Production host public IP."
  value       = module.kiditem_production_host.public_ip
}

output "elastic_ip_allocation_id" {
  description = "Production Elastic IP allocation id."
  value       = module.kiditem_production_host.elastic_ip_allocation_id
}
