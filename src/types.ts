export interface ApiProvider {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
}

export interface EmployeeConfig {
  id: string;
  name: string;
  role: string;
  memory_limit: string;
  cpu_limit: string;
}

export interface EmployeeStatus extends EmployeeConfig {
  status: string;
}

export interface AppConfig {
  api_providers: ApiProvider[];
  employees: EmployeeConfig[];
  default_image?: string;
  template_path?: string;
}
