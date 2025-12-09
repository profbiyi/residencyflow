
import { ConnectorType, Pipeline, PipelineStatus, ConnectorInstance, TeamMember, AuditLog, BillingStats, User, RunHistory, Organization, LineageNode, LineageEdge, DataQualityMetric } from './types';
import { Database, FileJson, Server, Globe, Box, CreditCard, ShoppingCart, Activity, HardDrive, FileText, Table, MessageSquare, Github, Briefcase, Megaphone, Brain, Code, Folder, Link, Cloud, Layers, Cpu, Radio, Shield, Zap, Smile, CheckCircle, AlertOctagon, Loader2, PauseCircle, GitBranch, Lock, EyeOff } from 'lucide-react';

// Helper to create standard DB schemas
const dbSchema = (portDefault: number) => ({
  required: ['host', 'database', 'username', 'password'],
  properties: {
    host: { type: 'string' as const, title: 'Host', description: 'Server hostname or IP' },
    port: { type: 'integer' as const, title: 'Port', default: portDefault },
    database: { type: 'string' as const, title: 'Database Name' },
    username: { type: 'string' as const, title: 'Username' },
    password: { type: 'string' as const, title: 'Password', format: 'password' as const, secret: true },
    schema: { type: 'string' as const, title: 'Schema (Optional)', description: 'Leave blank to discover all schemas, or specify one schema to filter' }
  }
});

const oauthSchema = {
  required: ['client_id', 'client_secret', 'refresh_token'],
  properties: {
    client_id: { type: 'string' as const, title: 'Client ID' },
    client_secret: { type: 'string' as const, title: 'Client Secret', format: 'password' as const, secret: true },
    refresh_token: { type: 'string' as const, title: 'Refresh Token', format: 'password' as const, secret: true },
    subdomain: { type: 'string' as const, title: 'Subdomain', description: 'Your account subdomain' }
  }
};

export const SOURCE_TYPES: ConnectorType[] = [
  // --- MAJOR DATABASES ---
  { 
    id: 'postgres', name: 'PostgreSQL', icon: 'database', type: 'source', description: 'Advanced relational database', category: 'Database',
    schema: dbSchema(5432)
  },
  { 
    id: 'mysql', name: 'MySQL / MariaDB', icon: 'database', type: 'source', description: 'Popular open-source database', category: 'Database',
    schema: dbSchema(3306)
  },
  { 
    id: 'mongodb', name: 'MongoDB', icon: 'database', type: 'source', description: 'NoSQL document database', category: 'Database',
    schema: {
      required: ['connection_string'],
      properties: {
        connection_string: { type: 'string' as const, title: 'Connection String', format: 'password' as const, description: 'mongodb://...' }
      }
    }
  },
  { 
    id: 'snowflake_src', name: 'Snowflake', icon: 'cloud', type: 'source', description: 'Cloud data warehouse', category: 'Database',
    schema: {
      required: ['account', 'username', 'password', 'warehouse', 'database'],
      properties: {
        account: { type: 'string' as const, title: 'Account Identifier' },
        username: { type: 'string' as const, title: 'Username' },
        password: { type: 'string' as const, title: 'Password', format: 'password' as const, secret: true },
        warehouse: { type: 'string' as const, title: 'Warehouse' },
        database: { type: 'string' as const, title: 'Database' },
        role: { type: 'string' as const, title: 'Role' }
      }
    }
  },

  // --- CRM & SALES ---
  { 
    id: 'salesforce', name: 'Salesforce', icon: 'briefcase', type: 'source', description: 'Leading enterprise CRM', category: 'CRM',
    schema: oauthSchema
  },
  { 
    id: 'hubspot', name: 'HubSpot', icon: 'users', type: 'source', description: 'CRM, Marketing & Service', category: 'CRM',
    schema: {
      required: ['access_token'],
      properties: {
        access_token: { type: 'string' as const, title: 'Access Token', format: 'password' as const, secret: true }
      }
    }
  },
  { 
    id: 'zendesk', name: 'Zendesk', icon: 'message-square', type: 'source', description: 'Customer service software', category: 'CRM',
    schema: {
      required: ['subdomain', 'email', 'api_token'],
      properties: {
        subdomain: { type: 'string' as const, title: 'Zendesk Subdomain' },
        email: { type: 'string' as const, title: 'Admin Email' },
        api_token: { type: 'string' as const, title: 'API Token', format: 'password' as const, secret: true }
      }
    }
  },

  // --- PRODUCTIVITY & WORK ---
  {
    id: 'notion', name: 'Notion', icon: 'file-text', type: 'source', description: 'Notes, docs & databases', category: 'Productivity',
    schema: {
      required: ['api_key'],
      properties: {
        api_key: { type: 'string' as const, title: 'Internal Integration Token', format: 'password' as const, secret: true }
      }
    }
  },
  {
    id: 'jira', name: 'Jira', icon: 'check-square', type: 'source', description: 'Issue & project tracking', category: 'Productivity',
    schema: {
      required: ['url', 'email', 'api_token'],
      properties: {
        url: { type: 'string' as const, title: 'Jira URL (https://your-domain.atlassian.net)' },
        email: { type: 'string' as const, title: 'User Email' },
        api_token: { type: 'string' as const, title: 'API Token', format: 'password' as const, secret: true }
      }
    }
  },
  {
    id: 'slack', name: 'Slack', icon: 'message-square', type: 'source', description: 'Messaging channels', category: 'Productivity',
    schema: {
      required: ['access_token'],
      properties: {
        access_token: { type: 'string' as const, title: 'Bot User OAuth Token', format: 'password' as const, secret: true },
        start_date: { type: 'string' as const, title: 'Start Date (YYYY-MM-DD)', description: 'Fetch history from this date' },
        include_private: { type: 'boolean' as const, title: 'Include Private Channels', default: false }
      }
    }
  },
  {
    id: 'google_sheets', name: 'Google Sheets', icon: 'table', type: 'source', description: 'Spreadsheets', category: 'Productivity',
    schema: {
      required: ['spreadsheet_id', 'credentials_json'],
      properties: {
        spreadsheet_id: { type: 'string' as const, title: 'Spreadsheet ID' },
        credentials_json: { type: 'string' as const, title: 'Service Account JSON', format: 'json' as const },
        range_name: { type: 'string' as const, title: 'Range (Optional)' }
      }
    }
  },

  // --- E-COMMERCE ---
  {
    id: 'shopify', name: 'Shopify', icon: 'shopping-cart', type: 'source', description: 'E-commerce platform', category: 'E-Commerce',
    schema: {
      required: ['shop_url', 'access_token'],
      properties: {
        shop_url: { type: 'string' as const, title: 'Shop URL (my-shop.myshopify.com)' },
        access_token: { type: 'string' as const, title: 'Admin API Access Token', format: 'password' as const, secret: true },
        start_date: { type: 'string' as const, title: 'Start Date (YYYY-MM-DD)' },
        import_metafields: { type: 'boolean' as const, title: 'Import Metafields', default: false }
      }
    }
  },

  // --- MARKETING & ANALYTICS ---
  { 
    id: 'google_analytics', name: 'Google Analytics 4', icon: 'activity', type: 'source', description: 'Web traffic analytics', category: 'Marketing',
    schema: {
      required: ['property_id', 'service_account_credentials'],
      properties: {
        property_id: { type: 'string' as const, title: 'GA4 Property ID' },
        service_account_credentials: { type: 'string' as const, title: 'Service Account JSON', format: 'json' as const, description: 'Paste full JSON content' }
      }
    }
  },
  { 
    id: 'facebook_ads', name: 'Facebook Ads', icon: 'megaphone', type: 'source', description: 'Meta advertising data', category: 'Marketing',
    schema: {
      required: ['access_token', 'account_id'],
      properties: {
        access_token: { type: 'string' as const, title: 'Access Token', format: 'password' as const, secret: true },
        account_id: { type: 'string' as const, title: 'Ad Account ID' }
      }
    }
  },

  // --- FINANCE ---
  { 
    id: 'stripe', name: 'Stripe', icon: 'credit-card', type: 'source', description: 'Payment processing', category: 'Finance',
    schema: {
      required: ['api_key'],
      properties: {
        api_key: { type: 'string' as const, title: 'Secret Key (sk_live_...)', format: 'password' as const, secret: true }
      }
    }
  },
  
  // --- ENGINEERING ---
  { 
    id: 'github', name: 'GitHub', icon: 'github', type: 'source', description: 'Code hosting & collaboration', category: 'Engineering',
    schema: {
      required: ['access_token'],
      properties: {
        access_token: { type: 'string' as const, title: 'Personal Access Token', format: 'password' as const, secret: true },
        owner: { type: 'string' as const, title: 'Repository Owner (Org/User)' }
      }
    }
  },

  // --- FILES & STORAGE ---
  { 
    id: 's3_src', name: 'AWS S3', icon: 'folder', type: 'source', description: 'Object storage', category: 'Files',
    schema: {
      required: ['bucket', 'aws_access_key_id', 'aws_secret_access_key'],
      properties: {
        bucket: { type: 'string' as const, title: 'Bucket Name' },
        aws_access_key_id: { type: 'string' as const, title: 'Access Key ID' },
        aws_secret_access_key: { type: 'string' as const, title: 'Secret Access Key', format: 'password' as const, secret: true },
        region_name: { type: 'string' as const, title: 'Region', enum: ['us-east-1', 'us-west-2', 'eu-central-1', 'af-south-1'] }
      }
    }
  },

  // --- MORE DATABASES ---
  { 
    id: 'redshift', name: 'Amazon Redshift', icon: 'database', type: 'source', description: 'AWS data warehouse', category: 'Database',
    schema: dbSchema(5439)
  },
  { 
    id: 'mssql', name: 'Microsoft SQL Server', icon: 'database', type: 'source', description: 'Enterprise database', category: 'Database',
    schema: dbSchema(1433)
  },
  { 
    id: 'oracle', name: 'Oracle Database', icon: 'database', type: 'source', description: 'Enterprise relational DB', category: 'Database',
    schema: {
      required: ['host', 'port', 'service_name', 'username', 'password'],
      properties: {
        host: { type: 'string' as const, title: 'Host' },
        port: { type: 'integer' as const, title: 'Port', default: 1521 },
        service_name: { type: 'string' as const, title: 'Service Name / SID' },
        username: { type: 'string' as const, title: 'Username' },
        password: { type: 'string' as const, title: 'Password', format: 'password' as const, secret: true }
      }
    }
  },

  // --- MORE CRM & MARKETING ---
  { 
    id: 'pipedrive', name: 'Pipedrive', icon: 'briefcase', type: 'source', description: 'Sales CRM', category: 'CRM',
    schema: {
      required: ['api_key'],
      properties: {
        api_key: { type: 'string' as const, title: 'API Token', format: 'password' as const, secret: true }
      }
    }
  },
  { 
    id: 'intercom', name: 'Intercom', icon: 'message-square', type: 'source', description: 'Customer messaging', category: 'CRM',
    schema: {
      required: ['access_token'],
      properties: {
        access_token: { type: 'string' as const, title: 'Access Token', format: 'password' as const, secret: true }
      }
    }
  },
  { 
    id: 'mailchimp', name: 'Mailchimp', icon: 'megaphone', type: 'source', description: 'Email marketing', category: 'Marketing',
    schema: {
      required: ['api_key'],
      properties: {
        api_key: { type: 'string' as const, title: 'API Key', format: 'password' as const, secret: true }
      }
    }
  },
  { 
    id: 'google_ads', name: 'Google Ads', icon: 'megaphone', type: 'source', description: 'Search advertising', category: 'Marketing',
    schema: {
      required: ['customer_id', 'developer_token', 'refresh_token', 'client_id', 'client_secret'],
      properties: {
        customer_id: { type: 'string' as const, title: 'Customer ID (without dashes)' },
        developer_token: { type: 'string' as const, title: 'Developer Token', format: 'password' as const, secret: true },
        refresh_token: { type: 'string' as const, title: 'Refresh Token', format: 'password' as const, secret: true },
        client_id: { type: 'string' as const, title: 'OAuth Client ID' },
        client_secret: { type: 'string' as const, title: 'OAuth Client Secret', format: 'password' as const, secret: true }
      }
    }
  },
  { 
    id: 'linkedin_ads', name: 'LinkedIn Ads', icon: 'briefcase', type: 'source', description: 'Professional network ads', category: 'Marketing',
    schema: {
      required: ['access_token', 'account_id'],
      properties: {
        access_token: { type: 'string' as const, title: 'Access Token', format: 'password' as const, secret: true },
        account_id: { type: 'string' as const, title: 'Ad Account ID' }
      }
    }
  },

  // --- MORE E-COMMERCE ---
  { 
    id: 'woocommerce', name: 'WooCommerce', icon: 'shopping-cart', type: 'source', description: 'WordPress e-commerce', category: 'E-Commerce',
    schema: {
      required: ['url', 'consumer_key', 'consumer_secret'],
      properties: {
        url: { type: 'string' as const, title: 'Store URL' },
        consumer_key: { type: 'string' as const, title: 'Consumer Key' },
        consumer_secret: { type: 'string' as const, title: 'Consumer Secret', format: 'password' as const, secret: true }
      }
    }
  },
  { 
    id: 'square', name: 'Square', icon: 'credit-card', type: 'source', description: 'Point of sale & payments', category: 'E-Commerce',
    schema: {
      required: ['access_token'],
      properties: {
        access_token: { type: 'string' as const, title: 'Access Token', format: 'password' as const, secret: true },
        is_sandbox: { type: 'boolean' as const, title: 'Sandbox Mode', default: false }
      }
    }
  },

  // --- MORE PRODUCTIVITY ---
  { 
    id: 'asana', name: 'Asana', icon: 'check-square', type: 'source', description: 'Work management', category: 'Productivity',
    schema: {
      required: ['access_token'],
      properties: {
        access_token: { type: 'string' as const, title: 'Personal Access Token', format: 'password' as const, secret: true }
      }
    }
  },
  { 
    id: 'airtable', name: 'Airtable', icon: 'table', type: 'source', description: 'Spreadsheet-database hybrid', category: 'Productivity',
    schema: {
      required: ['api_key', 'base_id'],
      properties: {
        api_key: { type: 'string' as const, title: 'API Key', format: 'password' as const, secret: true },
        base_id: { type: 'string' as const, title: 'Base ID' }
      }
    }
  },
  { 
    id: 'monday', name: 'Monday.com', icon: 'check-square', type: 'source', description: 'Work OS platform', category: 'Productivity',
    schema: {
      required: ['api_token'],
      properties: {
        api_token: { type: 'string' as const, title: 'API Token', format: 'password' as const, secret: true }
      }
    }
  },

  // --- MORE FILES & STORAGE ---
  { 
    id: 'gcs', name: 'Google Cloud Storage', icon: 'cloud', type: 'source', description: 'GCP object storage', category: 'Files',
    schema: {
      required: ['bucket_name', 'credentials_json'],
      properties: {
        bucket_name: { type: 'string' as const, title: 'Bucket Name' },
        credentials_json: { type: 'string' as const, title: 'Service Account JSON', format: 'json' as const },
        prefix: { type: 'string' as const, title: 'Path Prefix (Optional)' }
      }
    }
  },
  { 
    id: 'azure_blob', name: 'Azure Blob Storage', icon: 'cloud', type: 'source', description: 'Microsoft cloud storage', category: 'Files',
    schema: {
      required: ['account_name', 'account_key', 'container_name'],
      properties: {
        account_name: { type: 'string' as const, title: 'Storage Account Name' },
        account_key: { type: 'string' as const, title: 'Account Key', format: 'password' as const, secret: true },
        container_name: { type: 'string' as const, title: 'Container Name' }
      }
    }
  },
  { 
    id: 'sftp', name: 'SFTP', icon: 'server', type: 'source', description: 'Secure file transfer', category: 'Files',
    schema: {
      required: ['host', 'username'],
      properties: {
        host: { type: 'string' as const, title: 'SFTP Host' },
        port: { type: 'integer' as const, title: 'Port', default: 22 },
        username: { type: 'string' as const, title: 'Username' },
        password: { type: 'string' as const, title: 'Password', format: 'password' as const, secret: true },
        path: { type: 'string' as const, title: 'Remote Path' }
      }
    }
  },

  // --- MORE FINANCE ---
  { 
    id: 'quickbooks', name: 'QuickBooks', icon: 'credit-card', type: 'source', description: 'Accounting software', category: 'Finance',
    schema: {
      required: ['realm_id', 'client_id', 'client_secret', 'refresh_token'],
      properties: {
        realm_id: { type: 'string' as const, title: 'Company ID / Realm ID' },
        client_id: { type: 'string' as const, title: 'Client ID' },
        client_secret: { type: 'string' as const, title: 'Client Secret', format: 'password' as const, secret: true },
        refresh_token: { type: 'string' as const, title: 'Refresh Token', format: 'password' as const, secret: true },
        is_sandbox: { type: 'boolean' as const, title: 'Sandbox Mode', default: false }
      }
    }
  },
  { 
    id: 'xero', name: 'Xero', icon: 'credit-card', type: 'source', description: 'Cloud accounting', category: 'Finance',
    schema: {
      required: ['client_id', 'client_secret', 'tenant_id', 'refresh_token'],
      properties: {
        client_id: { type: 'string' as const, title: 'Client ID' },
        client_secret: { type: 'string' as const, title: 'Client Secret', format: 'password' as const, secret: true },
        tenant_id: { type: 'string' as const, title: 'Tenant ID' },
        refresh_token: { type: 'string' as const, title: 'Refresh Token', format: 'password' as const, secret: true }
      }
    }
  },

  // --- GENERIC ---
  { 
    id: 'rest_api', name: 'Generic REST API', icon: 'link', type: 'source', description: 'Configurable API source', category: 'Generic',
    schema: {
      required: ['base_url', 'endpoint_path'],
      properties: {
        base_url: { type: 'string' as const, title: 'Base URL' },
        endpoint_path: { type: 'string' as const, title: 'Resource Path' },
        auth_token: { type: 'string' as const, title: 'Bearer Token', format: 'password' as const, secret: true },
        pagination_type: { type: 'string' as const, title: 'Pagination', enum: ['page_number', 'limit_offset', 'cursor'] }
      }
    }
  },
  { 
    id: 'csv', name: 'CSV / Parquet File', icon: 'file', type: 'source', description: 'Local or remote files', category: 'Generic',
    schema: {
      required: ['file_path'],
      properties: {
        file_path: { type: 'string' as const, title: 'File Path or URL' },
        delimiter: { type: 'string' as const, title: 'Delimiter', default: ',' },
        has_header: { type: 'boolean' as const, title: 'Has Header Row', default: true }
      }
    }
  },
];

export const DESTINATION_TYPES: ConnectorType[] = [
  // --- WAREHOUSES ---
  { 
    id: 'snowflake', name: 'Snowflake', icon: 'cloud', type: 'destination', description: 'The Data Cloud', category: 'Warehouse',
    schema: {
      required: ['account', 'username', 'password', 'warehouse', 'database', 'schema'],
      properties: {
        account: { type: 'string' as const, title: 'Account URL' },
        username: { type: 'string' as const, title: 'Username' },
        password: { type: 'string' as const, title: 'Password', format: 'password' as const, secret: true },
        warehouse: { type: 'string' as const, title: 'Warehouse' },
        database: { type: 'string' as const, title: 'Database' },
        schema: { type: 'string' as const, title: 'Target Schema' }
      }
    }
  },
  { 
    id: 'bigquery', name: 'BigQuery', icon: 'cloud', type: 'destination', description: 'Serverless DW', category: 'Warehouse',
    schema: {
      required: ['project_id', 'dataset_id', 'credentials_json'],
      properties: {
        project_id: { type: 'string' as const, title: 'GCP Project ID' },
        dataset_id: { type: 'string' as const, title: 'Target Dataset' },
        credentials_json: { type: 'string' as const, title: 'Service Account JSON', format: 'json' as const }
      }
    }
  },
  { 
    id: 'postgres_dw', name: 'PostgreSQL', icon: 'database', type: 'destination', description: 'Standard SQL Database', category: 'Warehouse',
    schema: dbSchema(5432)
  },

  // --- DATA LAKES ---
  { 
    id: 'duckdb', name: 'DuckDB', icon: 'hard-drive', type: 'destination', description: 'Fast local analytical DB', category: 'Data Lake',
    schema: {
      required: ['path'],
      properties: {
        path: { type: 'string' as const, title: 'DB File Path', default: 'residency_data.duckdb' }
      }
    }
  },
  { 
    id: 's3', name: 'AWS S3', icon: 'server', type: 'destination', description: 'Parquet/JSON/Avro', category: 'Data Lake',
    schema: {
      required: ['bucket', 'access_key', 'secret_key'],
      properties: {
        bucket: { type: 'string' as const, title: 'Bucket Name' },
        access_key: { type: 'string' as const, title: 'Access Key' },
        secret_key: { type: 'string' as const, title: 'Secret Key', format: 'password' as const, secret: true },
        layout: { type: 'string' as const, title: 'File Layout', default: '{table_name}/{year}/{month}/{day}' }
      }
    }
  },

  // --- MORE WAREHOUSES ---
  { 
    id: 'redshift', name: 'Amazon Redshift', icon: 'database', type: 'destination', description: 'AWS cloud DW', category: 'Warehouse',
    schema: {
      required: ['host', 'database', 'username', 'password'],
      properties: {
        host: { type: 'string' as const, title: 'Cluster Endpoint' },
        port: { type: 'integer' as const, title: 'Port', default: 5439 },
        database: { type: 'string' as const, title: 'Database' },
        username: { type: 'string' as const, title: 'Username' },
        password: { type: 'string' as const, title: 'Password', format: 'password' as const, secret: true },
        schema: { type: 'string' as const, title: 'Schema', default: 'public' }
      }
    }
  },
  { 
    id: 'databricks', name: 'Databricks', icon: 'layers', type: 'destination', description: 'Lakehouse platform', category: 'Warehouse',
    schema: {
      required: ['server_hostname', 'http_path', 'access_token'],
      properties: {
        server_hostname: { type: 'string' as const, title: 'Server Hostname' },
        http_path: { type: 'string' as const, title: 'HTTP Path' },
        access_token: { type: 'string' as const, title: 'Access Token', format: 'password' as const, secret: true },
        catalog: { type: 'string' as const, title: 'Catalog', default: 'main' },
        schema: { type: 'string' as const, title: 'Schema', default: 'default' }
      }
    }
  },
  { 
    id: 'clickhouse', name: 'ClickHouse', icon: 'zap', type: 'destination', description: 'Fast analytics DB', category: 'Warehouse',
    schema: {
      required: ['host', 'database', 'username', 'password'],
      properties: {
        host: { type: 'string' as const, title: 'Host' },
        port: { type: 'integer' as const, title: 'HTTP Port', default: 8123 },
        database: { type: 'string' as const, title: 'Database' },
        username: { type: 'string' as const, title: 'Username' },
        password: { type: 'string' as const, title: 'Password', format: 'password' as const, secret: true }
      }
    }
  },
  { 
    id: 'mysql_dw', name: 'MySQL', icon: 'database', type: 'destination', description: 'MySQL as warehouse', category: 'Warehouse',
    schema: dbSchema(3306)
  },

  // --- MORE DATA LAKES ---
  { 
    id: 'azure_synapse', name: 'Azure Synapse', icon: 'cloud', type: 'destination', description: 'Microsoft analytics', category: 'Data Lake',
    schema: {
      required: ['server', 'database', 'username', 'password'],
      properties: {
        server: { type: 'string' as const, title: 'Server (workspace-name.sql.azuresynapse.net)' },
        database: { type: 'string' as const, title: 'SQL Pool Database' },
        username: { type: 'string' as const, title: 'Username' },
        password: { type: 'string' as const, title: 'Password', format: 'password' as const, secret: true }
      }
    }
  },
  { 
    id: 'gcs_dest', name: 'Google Cloud Storage', icon: 'cloud', type: 'destination', description: 'GCP object storage', category: 'Data Lake',
    schema: {
      required: ['bucket_name', 'credentials_json'],
      properties: {
        bucket_name: { type: 'string' as const, title: 'Bucket Name' },
        credentials_json: { type: 'string' as const, title: 'Service Account JSON', format: 'json' as const },
        prefix: { type: 'string' as const, title: 'Path Prefix', default: 'data/' }
      }
    }
  },
  { 
    id: 'azure_blob_dest', name: 'Azure Blob Storage', icon: 'cloud', type: 'destination', description: 'Azure object storage', category: 'Data Lake',
    schema: {
      required: ['account_name', 'account_key', 'container_name'],
      properties: {
        account_name: { type: 'string' as const, title: 'Storage Account' },
        account_key: { type: 'string' as const, title: 'Account Key', format: 'password' as const, secret: true },
        container_name: { type: 'string' as const, title: 'Container' }
      }
    }
  },
  { 
    id: 'motherduck', name: 'MotherDuck', icon: 'cloud', type: 'destination', description: 'Serverless DuckDB', category: 'Data Lake',
    schema: {
      required: ['api_key'],
      properties: {
        api_key: { type: 'string' as const, title: 'MotherDuck Token', format: 'password' as const, secret: true },
        database: { type: 'string' as const, title: 'Database Name', default: 'my_db' }
      }
    }
  },

  // --- VECTOR STORES (AI) ---
  { 
    id: 'weaviate', name: 'Weaviate', icon: 'brain', type: 'destination', description: 'Vector Search Engine', category: 'Vector DB',
    schema: {
      required: ['url', 'api_key'],
      properties: {
        url: { type: 'string' as const, title: 'Weaviate URL' },
        api_key: { type: 'string' as const, title: 'API Key', format: 'password' as const, secret: true }
      }
    }
  },
  { 
    id: 'qdrant', name: 'Qdrant', icon: 'brain', type: 'destination', description: 'Vector similarity search', category: 'Vector DB',
    schema: {
      required: ['url'],
      properties: {
        url: { type: 'string' as const, title: 'Qdrant URL' },
        api_key: { type: 'string' as const, title: 'API Key (Optional)', format: 'password' as const, secret: true },
        collection_name: { type: 'string' as const, title: 'Collection Name', default: 'documents' }
      }
    }
  },
  { 
    id: 'pinecone', name: 'Pinecone', icon: 'brain', type: 'destination', description: 'Managed vector DB', category: 'Vector DB',
    schema: {
      required: ['api_key', 'environment', 'index_name'],
      properties: {
        api_key: { type: 'string' as const, title: 'API Key', format: 'password' as const, secret: true },
        environment: { type: 'string' as const, title: 'Environment' },
        index_name: { type: 'string' as const, title: 'Index Name' }
      }
    }
  },

  // --- FILE-BASED DESTINATIONS ---
  { 
    id: 'filesystem', name: 'Local Filesystem', icon: 'folder', type: 'destination', description: 'Save to local disk', category: 'Files',
    schema: {
      required: ['base_path'],
      properties: {
        base_path: { type: 'string' as const, title: 'Base Directory Path', default: './data_output' },
        file_format: { type: 'string' as const, title: 'Format', enum: ['parquet', 'jsonl', 'csv'], default: 'parquet' }
      }
    }
  },
];

export const SYNC_MODE_OPTIONS = [
  { value: 'full_load', label: 'Full Load (Replace)', description: 'Replaces destination data with a full fresh copy.' },
  { value: 'incremental_append', label: 'Incremental (Append)', description: 'Adds new records only. Good for logs.' },
  { value: 'incremental_merge', label: 'Incremental (Merge)', description: 'Updates existing records and adds new ones (Dedup).' },
];

export const FREQUENCY_OPTIONS = [
  { value: 'realtime', label: 'Real-time (Streaming)' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

// Mock Data (Empty - Real data comes from backend)
export const MOCK_ORGANIZATIONS: Organization[] = [];

export const MOCK_USERS: (User & {password: string})[] = [
  // Super Admin (for local demo/development login only - NEVER exposed publicly)
  { id: 'u-super', organizationId: 'org-system', name: 'Super Admin', email: 'admin@residencyflow.com', companyName: 'ResidencyFlow', role: 'SuperAdmin', password: 'admin123' }
];

export const MOCK_SOURCES: ConnectorInstance[] = [];

export const MOCK_DESTINATIONS: ConnectorInstance[] = [];

export const MOCK_PIPELINES: Pipeline[] = [];

export const MOCK_RUN_HISTORY: RunHistory[] = [];

export const MOCK_TEAM: TeamMember[] = [];

export const MOCK_AUDIT_LOGS: AuditLog[] = [];

export const MOCK_BILLING: BillingStats = {
  planName: 'Free',
  rowsUsed: 0,
  rowsLimit: 0,
  costCurrent: 0,
  renewalDate: ''
};

// --- OBSERVABILITY & LINEAGE DATA ---
export const MOCK_LINEAGE_NODES: LineageNode[] = [
  { id: 'node-src', label: 'Postgres Prod', type: 'source', status: 'healthy', icon: 'database', freshness: '1 min ago', volume: '45GB' },
  { id: 'node-pii', label: 'PII Masking', type: 'transform', status: 'healthy', icon: 'shield', freshness: '1 min ago', volume: '45GB' },
  { id: 'node-stage', label: 'S3 Raw Lake', type: 'storage', status: 'healthy', icon: 'folder', freshness: '1 min ago', volume: '45GB' },
  { id: 'node-dw', label: 'Snowflake Core', type: 'storage', status: 'healthy', icon: 'cloud', freshness: '2 mins ago', volume: '42GB' },
  { id: 'node-dbt', label: 'dbt Gold Model', type: 'model', status: 'healthy', icon: 'git-branch', freshness: '10 mins ago', volume: '12GB' },
];

export const MOCK_LINEAGE_EDGES: LineageEdge[] = [
  { from: 'node-src', to: 'node-pii' },
  { from: 'node-pii', to: 'node-stage' },
  { from: 'node-stage', to: 'node-dw' },
  { from: 'node-dw', to: 'node-dbt' },
];

export const MOCK_DATA_QUALITY: Record<string, DataQualityMetric[]> = {
  'node-src': [
    { column: 'user_id', nullCount: 0, uniqueCount: 154000, score: 100 },
    { column: 'email', nullCount: 12, uniqueCount: 153900, score: 99.8 },
    { column: 'created_at', nullCount: 0, uniqueCount: 154000, score: 100 },
  ],
  'node-pii': [
    { column: 'email_hash', nullCount: 12, uniqueCount: 153900, score: 100 },
    { column: 'ssn_redacted', nullCount: 0, uniqueCount: 1, score: 100 },
  ],
  'node-dw': [
     { column: 'user_sk', nullCount: 0, uniqueCount: 154000, score: 100 },
     { column: 'total_spend', nullCount: 500, uniqueCount: 45000, min: 0, max: 12000, score: 98 },
  ]
};

export const ICON_MAP: Record<string, any> = {
  database: Database,
  users: Activity,
  'credit-card': CreditCard,
  file: FileJson,
  'hard-drive': HardDrive,
  cloud: Cloud,
  server: Server,
  'shopping-cart': ShoppingCart,
  'file-text': FileText,
  table: Table,
  'message-square': MessageSquare,
  github: Github,
  briefcase: Briefcase,
  megaphone: Megaphone,
  brain: Brain,
  code: Code,
  folder: Folder,
  link: Link,
  'check-square': FileText, 
  layers: Layers,
  zap: Zap,
  radio: Radio,
  shield: Shield,
  'git-branch': GitBranch,
  lock: Lock,
  'eye-off': EyeOff,
  default: Database
};

// --- VISUAL SYSTEM ---
export const STATUS_STYLES = {
  [PipelineStatus.Running]: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
    icon: Loader2,
    pulse: true,
    additional: 'shadow-[0_0_8px_rgba(59,130,246,0.2)]'
  },
  [PipelineStatus.Completed]: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    text: 'text-emerald-400',
    icon: CheckCircle,
    pulse: false,
    additional: 'shadow-[0_0_8px_rgba(16,185,129,0.2)]'
  },
  [PipelineStatus.Failed]: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    text: 'text-red-400',
    icon: AlertOctagon,
    pulse: false,
    additional: 'shadow-[0_0_8px_rgba(239,68,68,0.2)]'
  },
  [PipelineStatus.Idle]: {
    bg: 'bg-slate-800/50',
    border: 'border-slate-700',
    text: 'text-slate-400',
    icon: PauseCircle,
    pulse: false,
    additional: ''
  }
};
