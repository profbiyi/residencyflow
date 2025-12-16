// NEW API Service - Clean rebuild with correct typing
// Based on validated backend at http://144.91.84.147:8000

import { Pipeline, ConnectorInstance, User, Organization } from '../types';

// ==========================
// CONFIGURATION
// ==========================

const API_URL = import.meta.env.VITE_API_URL || '';
const IS_LIVE = !!API_URL;

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ' + (localStorage.getItem('access_token') || '')
});

// ==========================
// ERROR HANDLING
// ==========================

const handleResponse = async (response: Response) => {
  if (response.status === 401) {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    window.location.href = '/';
    throw new Error('Session expired. Please login again.');
  }
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response;
};

// ==========================
// TYPE DEFINITIONS
// ==========================

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

interface ConnectorTestRequest {
  typeId: string;
  config: Record<string, any>;
}

interface ConnectorTestResponse {
  success: boolean;
  message: string;
}

interface ConnectorSchemaResponse {
  connector_id: string;
  connector_type: string;
  resources: Array<{
    name: string;
    type: string;
    selected: boolean;
    schema?: string;
    table?: string;
  }>;
  source_type: 'database' | 'api' | 'unknown';
  schema_mode?: 'single' | 'multi';
  available_schemas?: string[];
}

// ==========================
// API METHODS
// ==========================

export const api = {
  // SYSTEM
  system: {
    isLive: () => IS_LIVE,
    checkHealth: async (): Promise<boolean> => {
      if (!IS_LIVE) return true;
      try {
        const res = await fetch(`${API_URL}/health`);
        return res.ok;
      } catch {
        return false;
      }
    }
  },

  // AUTHENTICATION
  auth: {
    login: async (email: string, password: string): Promise<User> => {
      if (!IS_LIVE) {
        throw new Error('Mock auth not implemented - set VITE_API_URL');
      }

      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);

      const res = await fetch(`${API_URL}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      });

      if (!res.ok) throw new Error('Invalid credentials');
      
      const data: LoginResponse = await res.json();
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      
      return data.user;
    },

    logout: () => {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
  },

  // CONNECTORS
  connectors: {
    list: async (type: 'source' | 'destination'): Promise<ConnectorInstance[]> => {
      if (!IS_LIVE) throw new Error('Set VITE_API_URL');

      const res = await fetch(`${API_URL}/connectors?type=${type}`, {
        headers: getHeaders()
      });
      await handleResponse(res);
      return await res.json();
    },

    create: async (connector: any): Promise<ConnectorInstance> => {
      if (!IS_LIVE) throw new Error('Set VITE_API_URL');

      // Transform camelCase to snake_case for backend
      const payload = {
        name: connector.name,
        type_id: connector.typeId || connector.type_id,
        connector_type: connector.connectorType || connector.connector_type,
        configuration: connector.configuration,
        region: connector.region || 'Auto-detected'
      };

      const res = await fetch(`${API_URL}/connectors`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      await handleResponse(res);
      return await res.json();
    },

    test: async (typeId: string, config: Record<string, any>): Promise<ConnectorTestResponse> => {
      if (!IS_LIVE) {
        return { success: true, message: 'Connection verified (Simulated)' };
      }

      const res = await fetch(`${API_URL}/connectors/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typeId, config })
      });
      
      return await res.json();
    },

    delete: async (id: string): Promise<void> => {
      if (!IS_LIVE) return;

      const res = await fetch(`${API_URL}/connectors/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      await handleResponse(res);
    },

    getSchema: async (connectorId: string): Promise<ConnectorSchemaResponse> => {
      if (!IS_LIVE) {
        return {
          connector_id: connectorId,
          connector_type: 'postgres',
          resources: [
            { name: 'users', type: 'table', selected: true },
            { name: 'orders', type: 'table', selected: true }
          ],
          source_type: 'database'
        };
      }

      const res = await fetch(`${API_URL}/connectors/${connectorId}/schema`, {
        headers: getHeaders()
      });
      await handleResponse(res);
      return await res.json();
    }
  },

  // PIPELINES
  pipelines: {
    list: async (): Promise<Pipeline[]> => {
      if (!IS_LIVE) throw new Error('Set VITE_API_URL');

      const res = await fetch(`${API_URL}/pipelines`, {
        headers: getHeaders()
      });
      await handleResponse(res);
      return await res.json();
    },

    create: async (pipeline: any): Promise<Pipeline> => {
      if (!IS_LIVE) throw new Error('Set VITE_API_URL');

      // Transform camelCase to snake_case for backend
      const payload = {
        name: pipeline.name,
        source_id: pipeline.sourceId || pipeline.source_id,
        destination_id: pipeline.destinationId || pipeline.destination_id,
        sync_mode: pipeline.syncMode || pipeline.sync_mode,
        frequency: pipeline.frequency,
        schema_policy: pipeline.schemaPolicy || pipeline.schema_policy || 'evolve',
        notification_config: pipeline.notifications || pipeline.notification_config,
        transformation_config: pipeline.transformation || pipeline.transformation_config
      };

      const res = await fetch(`${API_URL}/pipelines`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      await handleResponse(res);
      return await res.json();
    },

    run: async (id: string): Promise<{ status: string; flow_run_id: string }> => {
      if (!IS_LIVE) throw new Error('Set VITE_API_URL');

      const res = await fetch(`${API_URL}/pipelines/${id}/run`, {
        method: 'POST',
        headers: getHeaders()
      });
      await handleResponse(res);
      return await res.json();
    }
  },

  // ADMIN (SuperAdmin only)
  admin: {
    listOrganizations: async (): Promise<Organization[]> => {
      if (!IS_LIVE) throw new Error('Set VITE_API_URL');

      const res = await fetch(`${API_URL}/admin/organizations`, {
        headers: getHeaders()
      });
      await handleResponse(res);
      return await res.json();
    },

    createOrganization: async (orgData: {
      name: string;
      admin_email: string;
      admin_name: string;
      password: string;
      plan: string;
    }): Promise<Organization> => {
      if (!IS_LIVE) throw new Error('Set VITE_API_URL');

      const res = await fetch(`${API_URL}/admin/organizations`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(orgData)
      });
      await handleResponse(res);
      return await res.json();
    }
  },

  // TEAM MANAGEMENT
  team: {
    invite: async (email: string, role: string): Promise<{ message: string; id: string; token: string }> => {
      if (!IS_LIVE) throw new Error('Set VITE_API_URL');

      const res = await fetch(`${API_URL}/team/invite`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ email, role })
      });
      await handleResponse(res);
      return await res.json();
    },

    listInvitations: async (): Promise<any[]> => {
      if (!IS_LIVE) throw new Error('Set VITE_API_URL');

      const res = await fetch(`${API_URL}/team/invitations`, {
        headers: getHeaders()
      });
      await handleResponse(res);
      return await res.json();
    }
  }
};
