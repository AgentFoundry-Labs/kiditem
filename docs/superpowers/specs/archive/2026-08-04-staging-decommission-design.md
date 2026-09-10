# Hosted Environment Decommission Design

## Classification

This is a deployment platform-boundary decommission. It removes the retired
hosted staging lane and the never-provisioned production scaffold without
changing Office runtime ownership or application business behavior.

## Decision

Office is the active operational environment and runs its own PostgreSQL,
object storage, API, web, and worker services locally. The hosted staging
environment is obsolete and its Supabase schema/data are not authoritative for
the current `develop`/`release/office` schema.

The staging Supabase project, EC2 runtime, DNS record, GitHub Environment, and
repository entrypoints are therefore deleted without a DB or object backup.
The repository's production workflow, Compose, Terraform, and runbook scaffold
is also removed because no production runtime ever existed. Office remains the
only deployable runtime surface; a future home-server move extends that Office
boundary instead of inventing a second environment.

## Repository Contract

- Remove staging and production hosted workflows, Compose files, deploy
  helpers, Terraform stacks/modules, and runbooks.
- Remove the staging DB-baseline and Supabase cache-control helpers.
- Remove the retired Supabase storage origin and public staging web origins
  from the unified extension.
- Add a regression gate that fails if a hosted staging/production deployment
  entrypoint is reintroduced and confirms the Office path remains intact.
- Keep local/Office runtime and the protected `release/office` branch intact.

## External Teardown

1. Delete Supabase project `gheoobctiarluauprvro`.
2. Terminate EC2 instance `i-0ac44acbdfb95b5a3` in AWS account
   `507044084161`, region `ap-southeast-2`. It has no Elastic IP; its
   auto-assigned public IP is released on termination. Verify deletion of root
   volume `vol-097ef9bdb741bcbce` (`DeleteOnTermination=true`) and remove only
   staging-exclusive identity/network resources after their use count reaches
   zero.
3. Delete the proxied `staging.merchon.org` DNS record.
4. Delete the GitHub `staging` Environment after AWS and DNS no longer need its
   SSH/configuration material.
5. Delete local `.secrets/staging/` only after the AWS teardown is verified.

## Verification

- Supabase project hostname no longer resolves.
- AWS reports the instance terminated and no staging-exclusive volume, key
  pair, role/profile, or security group remains.
- `staging.merchon.org` no longer resolves.
- GitHub API reports no `staging` Environment.
- The staging decommission contract test, script inventory, script tests,
  convention checks, Office workflow parsing, and Office deployment checks
  pass.
