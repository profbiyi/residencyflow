
import { MOCK_PIPELINES, MOCK_SOURCES, MOCK_DESTINATIONS, MOCK_TEAM, MOCK_AUDIT_LOGS, MOCK_ORGANIZATIONS, MOCK_USERS } from '../constants';
import { Pipeline, ConnectorInstance, User, TeamMember, AuditLog, Organization, BillingStats } from '../types';

// ENVIRONMENT CONFIGURATION
// In Docker/Prod, this variable will be set. In Studio/Local demo, it is undefined.
const API_URL = import.meta.env.VITE_API_URL || '';
const IS_LIVE = !!API_URL;

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ' + (localStorage.getItem('token') || '')
});

// Global error handler for 401 responses
const handleResponse = async (response: Response) => {
  if (response.status === 401) {
    // Token expired or invalid - logout user
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
    throw new Error('Session expired. Please login again.');
  }
  return response;
};

export const api = {
  system: {
    isLive: () => IS_LIVE,
    checkHealth: async () => {
      if (!IS_LIVE) return true;
      try {
        const res = await fetch(`${API_URL}/health`);
        return res.ok;
      } catch (e) { return false; }
    }
  },

  auth: {
    login: async (email: string, password: string): Promise<User> => {
      if (IS_LIVE) {
        // Real Backend Auth
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);
        
        const res = await fetch(`${API_URL}/auth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString()
        });
        
        if (!res.ok) throw new Error('Invalid credentials');
        const data = await res.json();
        // Store token for future requests
        localStorage.setItem('token', data.access_token);
        return data.user;
      }

      // Mock Auth
      const mockUser = MOCK_USERS.find(u => u.email === email && u.password === password);
      if (!mockUser) throw new Error("Invalid email or password");
      // Return user without password field
      const { password: _, ...safeUser } = mockUser;
      return safeUser;
    }
  },

  pipelines: {
    list: async (): Promise<Pipeline[]> => {
      if (IS_LIVE) {
         const res = await fetch(`${API_URL}/pipelines`, { headers: getHeaders() });
         await handleResponse(res);
         return await res.json();
      }
      return MOCK_PIPELINES;
    },
    create: async (pipeline: Pipeline): Promise<Pipeline> => {
      if (IS_LIVE) {
         // Convert camelCase to snake_case for backend
         const payload = {
           name: pipeline.name,
           source_id: pipeline.sourceId,
           destination_id: pipeline.destinationId,
           sync_mode: pipeline.syncMode,
           frequency: pipeline.frequency,
           schema_policy: pipeline.schemaPolicy || 'evolve',
           notification_config: pipeline.notifications || null,
           transformation_config: pipeline.transformation || null
         };
         const res = await fetch(`${API_URL}/pipelines`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
         });
         return await res.json();
      }
      return pipeline;
    },
    run: async (id: string): Promise<boolean> => {
       if (IS_LIVE) {
          const res = await fetch(`${API_URL}/pipelines/${id}/run`, { method: 'POST', headers: getHeaders() });
          return res.ok;
       }
       return true;
    }
  },

  connectors: {
    list: async (type: 'source'|'destination'): Promise<ConnectorInstance[]> => {
      if (IS_LIVE) {
        const res = await fetch(`${API_URL}/connectors?type=${type}`, { headers: getHeaders() });
        await handleResponse(res);
        return await res.json();
      }
      return type === 'source' ? MOCK_SOURCES : MOCK_DESTINATIONS;
    },
    create: async (connector: ConnectorInstance): Promise<ConnectorInstance> => {
      if (IS_LIVE) {
         // Convert camelCase to snake_case for backend
         const payload = {
           name: connector.name,
           type_id: connector.typeId,
           connector_type: connector.connectorType,
           configuration: connector.configuration,
           region: connector.region
         };
         const res = await fetch(`${API_URL}/connectors`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
         });
         return await res.json();
      }
      return connector;
    },
    test: async (typeId: string, config: any): Promise<{success: boolean, message: string}> => {
        if (IS_LIVE) {
            const res = await fetch(`${API_URL}/connectors/test`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ typeId, config })
            });
            return await res.json();
        }
        return { success: true, message: "Connection verified (Simulated)" };
    },
    delete: async (id: string): Promise<void> => {
        if (IS_LIVE) {
            const res = await fetch(`${API_URL}/connectors/${id}`, {
                method: 'DELETE',
                headers: getHeaders()
            });
            await handleResponse(res);
        }
    },
    getSchema: async (connectorId: string): Promise<{resources: Array<{name: string, type: string, selected: boolean}>, source_type: string}> => {
        if (IS_LIVE) {
            const res = await fetch(`${API_URL}/connectors/${connectorId}/schema`, {
                headers: getHeaders()
            });
            await handleResponse(res);
            return await res.json();
        }
        // Mock response
        return {
            resources: [
                {name: 'users', type: 'table', selected: true},
                {name: 'orders', type: 'table', selected: true},
                {name: 'products', type: 'table', selected: true}
            ],
            source_type: 'database'
        };
    }
  },

  admin: {
    listOrganizations: async (): Promise<Organization[]> => {
       if (IS_LIVE) {
          const res = await fetch(`${API_URL}/admin/organizations`, { headers: getHeaders() });
          await handleResponse(res);
          return await res.json();
       }
       return MOCK_ORGANIZATIONS;
    },
    createOrganization: async (orgData: any): Promise<Organization> => {
       if (IS_LIVE) {
          // Convert camelCase to snake_case for backend
          const payload = {
            name: orgData.name,
            admin_email: orgData.adminEmail,
            admin_name: orgData.adminName,
            password: orgData.password,
            plan: orgData.plan
          };
          const res = await fetch(`${API_URL}/admin/organizations`, {
             method: 'POST',
             headers: getHeaders(),
             body: JSON.stringify(payload)
          });
          return await res.json();
       }
       return {
         id: `org-${Date.now()}`,
         name: orgData.name,
         slug: orgData.name.toLowerCase(),
         status: 'Active',
         createdAt: new Date().toISOString(),
         plan: orgData.plan,
         billingCycle: 'Monthly'
       } as Organization;
    },
    updatePlan: async (orgId: string, plan: string): Promise<boolean> => {
       if (IS_LIVE) {
          await fetch(`${API_URL}/admin/organizations/${orgId}/plan`, {
             method: 'PATCH',
             headers: getHeaders(),
             body: JSON.stringify({ plan })
          });
       }
       return true;
    }
  }
};
