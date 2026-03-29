SHELL := /bin/bash

RELEASE ?= envsync
NAMESPACE ?= envsync
KIND_CLUSTER_NAME ?= envsync
CHART_DIR ?= helm/envsync
VALUES_KIND ?= $(CHART_DIR)/values-kind.yaml
GENERATED_VALUES ?= .tmp/values-kind.generated.yaml
GENERATED_KIND_SMOKE_VALUES ?= .tmp/values-kind.smoke.yaml
HELM_WAIT ?= 1
HELM ?= $(if $(wildcard $(CURDIR)/.tmp/bin/helm),$(CURDIR)/.tmp/bin/helm,$(shell command -v helm 2>/dev/null))
SMOKE_REMOTE_IMAGES := \
	bitnami/kubectl:latest \
	postgres:17 \
	ghcr.io/zitadel/zitadel:v2.71.6 \
	openfga/openfga:v1.12.0 \
	ghcr.io/envsync-cloud/minikms:sha-735dfe8 \
	rustfs/rustfs:latest \
	registry-1.docker.io/bitnami/postgresql:latest \
	registry-1.docker.io/bitnami/redis:latest

.DEFAULT_GOAL := help

.PHONY: help
help:
	@printf "EnvSync deployment helpers\n\n"
	@printf "Targets:\n"
	@printf "  %-20s %s\n" "prereqs-check" "Verify required local tooling"
	@printf "  %-20s %s\n" "kind-create" "Create the local Kind cluster"
	@printf "  %-20s %s\n" "kind-delete" "Delete the local Kind cluster"
	@printf "  %-20s %s\n" "kind-build-images" "Build and load local images for Kind smoke tests"
	@printf "  %-20s %s\n" "kind-preload-images" "Pull and load remote images for Kind smoke tests"
	@printf "  %-20s %s\n" "helm-deps" "Build Helm chart dependencies"
	@printf "  %-20s %s\n" "helm-lint" "Lint the Helm chart"
	@printf "  %-20s %s\n" "helm-template" "Render the Helm chart locally"
	@printf "  %-20s %s\n" "helm-install-kind" "Install or upgrade the chart into Kind"
	@printf "  %-20s %s\n" "kind-smoke-test" "Run a local Kind deployment smoke test"
	@printf "  %-20s %s\n" "helm-uninstall" "Uninstall the release"
	@printf "  %-20s %s\n" "status" "Show workload status in the namespace"
	@printf "  %-20s %s\n" "port-forward-api" "Port-forward the API service to localhost:4000"

.PHONY: prereqs-check
prereqs-check:
	@missing=0; \
	for tool in kind kubectl openssl bun curl; do \
		if ! command -v $$tool >/dev/null 2>&1; then \
			echo "Missing required tool: $$tool"; \
			missing=1; \
		fi; \
	done; \
	if [ -z "$(HELM)" ] || [ ! -x "$(HELM)" ]; then \
		echo "Missing required tool: helm"; \
		echo "Install Helm from https://helm.sh/docs/intro/install/"; \
		missing=1; \
	fi; \
	if [ $$missing -ne 0 ]; then \
		exit 1; \
	fi

.PHONY: kind-create
kind-create: prereqs-check
	@if kind get clusters | grep -qx "$(KIND_CLUSTER_NAME)"; then \
		echo "Kind cluster '$(KIND_CLUSTER_NAME)' already exists"; \
	else \
		kind create cluster --name "$(KIND_CLUSTER_NAME)" --config kind-config.yaml; \
	fi

.PHONY: kind-delete
kind-delete:
	@kind delete cluster --name "$(KIND_CLUSTER_NAME)"

.PHONY: kind-build-images
kind-build-images: kind-create
	@echo "Building local Kind smoke images..."
	@docker build -f packages/envsync-api/Dockerfile -t envsync-api:kind packages/envsync-api
	@docker build -f apps/envsync-web/Dockerfile -t envsync-web:kind .
	@docker build -f apps/envsync-landing/Dockerfile -t envsync-landing:kind .
	@echo "Loading local images into Kind..."
	@kind load docker-image envsync-api:kind --name "$(KIND_CLUSTER_NAME)"
	@kind load docker-image envsync-web:kind --name "$(KIND_CLUSTER_NAME)"
	@kind load docker-image envsync-landing:kind --name "$(KIND_CLUSTER_NAME)"

.PHONY: kind-preload-images
kind-preload-images: kind-create
	@echo "Skipping remote image preload for Kind smoke tests."
	@echo "Third-party images will be pulled by the cluster at runtime."

.PHONY: helm-deps
helm-deps: prereqs-check
	@"$(HELM)" dependency build "$(CHART_DIR)"

.PHONY: helm-lint
helm-lint: helm-deps
	@"$(HELM)" lint "$(CHART_DIR)"

.PHONY: generate-kind-values
generate-kind-values:
	@mkdir -p .tmp
	@if [ -f "$(GENERATED_VALUES)" ] && [ "$(FORCE_REGENERATE_KIND_VALUES)" != "1" ]; then \
		echo "Reusing existing Kind generated values from $(GENERATED_VALUES)"; \
		exit 0; \
	fi
	@ZITADEL_MASTERKEY="$$(openssl rand -base64 24 | tr -d '\n' | cut -c1-32)"; \
	ZITADEL_ADMIN_PASSWORD="EnvSync!$$(openssl rand -hex 6)a1"; \
	MINIKMS_ROOT_KEY="$$(openssl rand -hex 32)"; \
	RUSTFS_SECRET_KEY="$$(openssl rand -base64 24 | tr -d '\n' | cut -c1-32)"; \
	POSTGRES_PASSWORD="$$(openssl rand -base64 24 | tr -d '\n' | cut -c1-32)"; \
	APP_PASSWORD="$$(openssl rand -base64 24 | tr -d '\n' | cut -c1-32)"; \
	REPLICATION_PASSWORD="$$(openssl rand -base64 24 | tr -d '\n' | cut -c1-32)"; \
	ZITADEL_DB_PASSWORD="$$(openssl rand -base64 24 | tr -d '\n' | cut -c1-32)"; \
	OPENFGA_DB_PASSWORD="$$(openssl rand -base64 24 | tr -d '\n' | cut -c1-32)"; \
	MINIKMS_DB_PASSWORD="$$(openssl rand -base64 24 | tr -d '\n' | cut -c1-32)"; \
	{ \
		echo "zitadel:"; \
		echo "  masterkey: \"$$ZITADEL_MASTERKEY\""; \
		echo "  admin:"; \
		echo "    password: \"$$ZITADEL_ADMIN_PASSWORD\""; \
		echo "minikms:"; \
		echo "  rootKey: \"$$MINIKMS_ROOT_KEY\""; \
		echo "rustfs:"; \
		echo "  accessKey: \"rustfsadmin\""; \
		echo "  secretKey: \"$$RUSTFS_SECRET_KEY\""; \
		echo "postgresql:"; \
		echo "  auth:"; \
		echo "    postgresPassword: \"$$POSTGRES_PASSWORD\""; \
		echo "    password: \"$$APP_PASSWORD\""; \
		echo "    replicationPassword: \"$$REPLICATION_PASSWORD\""; \
		echo "database:"; \
		echo "  roles:"; \
		echo "    zitadel:"; \
		echo "      password: \"$$ZITADEL_DB_PASSWORD\""; \
		echo "    openfga:"; \
		echo "      password: \"$$OPENFGA_DB_PASSWORD\""; \
		echo "    minikms:"; \
		echo "      password: \"$$MINIKMS_DB_PASSWORD\""; \
	} > "$(GENERATED_VALUES)"

.PHONY: helm-template
helm-template: helm-deps generate-kind-values
	@"$(HELM)" template "$(RELEASE)" "$(CHART_DIR)" \
		--namespace "$(NAMESPACE)" \
		-f "$(VALUES_KIND)" \
		-f "$(GENERATED_VALUES)"

.PHONY: generate-kind-smoke-values
generate-kind-smoke-values:
	@mkdir -p .tmp
	@{ \
		echo "api:"; \
		echo "  image:"; \
		echo "    repository: \"envsync-api\""; \
		echo "    tag: \"kind\""; \
		echo "    pullPolicy: IfNotPresent"; \
		echo "web:"; \
		echo "  image:"; \
		echo "    repository: \"envsync-web\""; \
		echo "    tag: \"kind\""; \
		echo "    pullPolicy: IfNotPresent"; \
		echo "landing:"; \
		echo "  image:"; \
		echo "    repository: \"envsync-landing\""; \
		echo "    tag: \"kind\""; \
		echo "    pullPolicy: IfNotPresent"; \
	} > "$(GENERATED_KIND_SMOKE_VALUES)"

.PHONY: helm-install-kind
helm-install-kind: kind-create helm-deps generate-kind-values
	@kubectl create namespace "$(NAMESPACE)" --dry-run=client -o yaml | kubectl apply -f -
	@"$(HELM)" upgrade --install "$(RELEASE)" "$(CHART_DIR)" \
		--namespace "$(NAMESPACE)" \
		--timeout 20m \
		-f "$(VALUES_KIND)" \
		-f "$(GENERATED_VALUES)" \
		$(if $(EXTRA_VALUES_FILE),-f "$(EXTRA_VALUES_FILE)") \
		$(if $(filter 1,$(HELM_WAIT)),--wait --wait-for-jobs --timeout 20m)

.PHONY: kind-smoke-test
kind-smoke-test: kind-build-images helm-deps generate-kind-values generate-kind-smoke-values
	@set -euo pipefail; \
		helm_rc=0; \
		pf_pid=""; \
		if kubectl get namespace "$(NAMESPACE)" >/dev/null 2>&1; then \
			echo "Cleaning previous release state in namespace $(NAMESPACE)..."; \
			"$(HELM)" uninstall "$(RELEASE)" -n "$(NAMESPACE)" --wait --timeout 10m >/dev/null 2>&1 || true; \
			kubectl delete job "$(RELEASE)-db-setup" "$(RELEASE)-dependency-ready" "$(RELEASE)-init" -n "$(NAMESPACE)" --ignore-not-found=true >/dev/null 2>&1 || true; \
			kubectl delete configmap "$(RELEASE)-bootstrap-lock" -n "$(NAMESPACE)" --ignore-not-found=true >/dev/null 2>&1 || true; \
			kubectl delete secret "$(RELEASE)-bootstrap" -n "$(NAMESPACE)" --ignore-not-found=true >/dev/null 2>&1 || true; \
		fi; \
	diag() { \
		echo ""; \
		echo "Smoke diagnostics:"; \
		helm status "$(RELEASE)" -n "$(NAMESPACE)" || true; \
		kubectl get pods,jobs,deploy,configmap -n "$(NAMESPACE)" || true; \
		kubectl get configmap "$(RELEASE)-bootstrap-lock" -n "$(NAMESPACE)" -o yaml || true; \
		kubectl logs job/"$(RELEASE)-db-setup" -n "$(NAMESPACE)" || true; \
		kubectl logs job/"$(RELEASE)-dependency-ready" -n "$(NAMESPACE)" || true; \
		kubectl logs job/"$(RELEASE)-init" -n "$(NAMESPACE)" || true; \
		migrate_job="$$(kubectl get jobs -n "$(NAMESPACE)" -l app.kubernetes.io/component=migrate -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' | tail -n 1)"; \
		if [ -n "$$migrate_job" ]; then \
			kubectl logs job/"$$migrate_job" -n "$(NAMESPACE)" || true; \
		fi; \
		kubectl get events -n "$(NAMESPACE)" --sort-by=.lastTimestamp | tail -n 80 || true; \
	}; \
	cleanup() { \
		if [ -n "$$pf_pid" ] && kill -0 "$$pf_pid" >/dev/null 2>&1; then \
			kill "$$pf_pid" >/dev/null 2>&1 || true; \
			wait "$$pf_pid" 2>/dev/null || true; \
		fi; \
	}; \
	trap 'cleanup' EXIT; \
	set +e; \
	$(MAKE) helm-install-kind HELM_WAIT=0 EXTRA_VALUES_FILE="$(GENERATED_KIND_SMOKE_VALUES)"; \
	helm_rc=$$?; \
	set -e; \
	if [ "$$helm_rc" -ne 0 ]; then \
		echo "Helm install exited with $$helm_rc; continuing with convergence checks."; \
	fi; \
	kubectl get namespace "$(NAMESPACE)" >/dev/null; \
	for attempt in $$(seq 1 24); do \
		if kubectl get configmap "$(RELEASE)-bootstrap-lock" -n "$(NAMESPACE)" >/dev/null 2>&1; then \
			break; \
		fi; \
		sleep 5; \
		if [ "$$attempt" -eq 24 ]; then \
			echo "Bootstrap lock configmap did not appear in time."; \
			diag; \
			exit 1; \
		fi; \
	done; \
	for deployment in "$(RELEASE)-api" "$(RELEASE)-zitadel" "$(RELEASE)-openfga" "$(RELEASE)-minikms" "$(RELEASE)-rustfs" "$(RELEASE)-web" "$(RELEASE)-landing"; do \
		echo "Waiting for deployment $$deployment..."; \
		if ! kubectl rollout status -n "$(NAMESPACE)" deployment/$$deployment --timeout=15m; then \
			echo "Deployment $$deployment did not become ready."; \
			kubectl describe deployment "$$deployment" -n "$(NAMESPACE)" || true; \
			kubectl get pods -n "$(NAMESPACE)" -o wide || true; \
			diag; \
			exit 1; \
		fi; \
	done; \
	for job in "$(RELEASE)-db-setup" "$(RELEASE)-dependency-ready" "$(RELEASE)-init"; do \
		if kubectl get -n "$(NAMESPACE)" job/$$job >/dev/null 2>&1; then \
			echo "Waiting for job $$job..."; \
			if ! kubectl wait -n "$(NAMESPACE)" --for=condition=complete job/$$job --timeout=15m; then \
				echo "Job $$job did not complete."; \
				kubectl describe job "$$job" -n "$(NAMESPACE)" || true; \
				kubectl logs job/"$$job" -n "$(NAMESPACE)" || true; \
				diag; \
				exit 1; \
			fi; \
		else \
			echo "Job $$job is not present, likely cleaned up after successful hook execution."; \
		fi; \
	done; \
	migrate_job="$$(kubectl get jobs -n "$(NAMESPACE)" -l app.kubernetes.io/component=migrate -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' | tail -n 1)"; \
	if [ -n "$$migrate_job" ]; then \
		echo "Waiting for migration job $$migrate_job..."; \
		if ! kubectl wait -n "$(NAMESPACE)" --for=condition=complete job/$$migrate_job --timeout=15m; then \
			echo "Migration job $$migrate_job did not complete."; \
			kubectl describe job "$$migrate_job" -n "$(NAMESPACE)" || true; \
			kubectl logs job/"$$migrate_job" -n "$(NAMESPACE)" || true; \
			diag; \
			exit 1; \
		fi; \
	else \
		echo "Migration job is not present, likely cleaned up after successful hook execution."; \
	fi; \
	bootstrap_status="$$(kubectl get configmap "$(RELEASE)-bootstrap-lock" -n "$(NAMESPACE)" -o jsonpath='{.data.status}')"; \
	bootstrap_phase="$$(kubectl get configmap "$(RELEASE)-bootstrap-lock" -n "$(NAMESPACE)" -o jsonpath='{.data.phase}')"; \
	if [ "$$bootstrap_status" != "complete" ]; then \
		echo "Bootstrap lock status is $$bootstrap_status (expected complete)."; \
		diag; \
		exit 1; \
	fi; \
	echo "Bootstrap phase: $$bootstrap_phase"; \
	kubectl port-forward -n "$(NAMESPACE)" svc/$(RELEASE)-api 4000:4000 >/tmp/$(RELEASE)-kind-smoke-port-forward.log 2>&1 & \
	pf_pid=$$!; \
	for attempt in $$(seq 1 30); do \
		if curl -fsS http://127.0.0.1:4000/health >/dev/null 2>&1; then \
			break; \
		fi; \
		sleep 2; \
		if [ "$$attempt" -eq 30 ]; then \
			echo "API health check did not succeed."; \
			cat /tmp/$(RELEASE)-kind-smoke-port-forward.log || true; \
			diag; \
			exit 1; \
		fi; \
	done; \
	curl -fsS http://127.0.0.1:4000/health; \
	echo ""; \
	echo "Kind smoke test passed."; \
	echo "Teardown: make helm-uninstall && make kind-delete"

.PHONY: helm-uninstall
helm-uninstall:
	@"$(HELM)" uninstall "$(RELEASE)" --namespace "$(NAMESPACE)"

.PHONY: status
status:
	@kubectl get all,pvc,ingress,configmap,secret -n "$(NAMESPACE)"

.PHONY: port-forward-api
port-forward-api:
	@kubectl port-forward -n "$(NAMESPACE)" svc/$(RELEASE)-api 4000:4000
