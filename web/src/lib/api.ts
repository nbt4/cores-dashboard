import axios from 'axios';

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Warehouse proxy API instance — routes through the dashboard's proxy to WarehouseCore
export const warehouseApi = axios.create({
  baseURL: '/api/v1/proxy/warehouse/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// RentalCore proxy API instance — routes through the dashboard's proxy to RentalCore
export const rentalApi = axios.create({
  baseURL: '/api/v1/proxy/rental/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// ---- Types needed by warehousecore admin tabs ----

export interface ZoneTypeDefinition {
  id: number;
  key: string;
  label: string;
  description?: string | null;
  default_led_pattern?: string;
  default_led_color?: string;
  default_intensity?: number;
}

export interface Zone {
  zone_id: number;
  code: string;
  name: string;
  type: string;
  description?: string | null;
  parent_zone_id?: number | null;
  capacity?: number | null;
  is_active: boolean;
}

export interface LEDAppearance {
  color: string;
  pattern: string;
  intensity: number;
  speed: number;
}

export interface LEDJobHighlightSettings {
  mode: 'all_bins' | 'required_only';
  required: LEDAppearance;
  non_required: LEDAppearance;
}

export interface LEDMapping {
  warehouse_id: string;
  shelves: Array<{
    shelf_id: string;
    bins: Array<{ bin_id: string; pixels: number[] }>;
  }>;
  led_strip: { length: number; data_pin: number; chipset: string };
  defaults: { color: string; pattern: string; intensity: number; speed?: number };
}

export interface LEDController {
  id: number;
  controller_id: string;
  display_name: string;
  topic_suffix: string;
  is_active: boolean;
  last_seen?: string | null;
  metadata?: Record<string, unknown> | null;
  ip_address?: string | null;
  hostname?: string | null;
  firmware_version?: string | null;
  mac_address?: string | null;
  status_data?: Record<string, unknown> | null;
  zone_types?: ZoneTypeDefinition[];
}

export interface LEDControllerPayload {
  controller_id?: string;
  display_name?: string;
  topic_suffix?: string;
  is_active?: boolean;
  metadata?: Record<string, unknown> | null;
  zone_type_ids?: number[];
}

export interface APILimits {
  device_limit: number;
  case_limit: number;
}

export interface APIKeyItem {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
  last_used_at?: string | null;
}

// ---- API function groups (using warehouseApi) ----

export const zonesApi = {
  getAll: () => warehouseApi.get<Zone[]>('/zones'),
};

export const ledApi = {
  getJobSettings: () => warehouseApi.get<LEDJobHighlightSettings>('/admin/led/job-highlights'),
  updateJobSettings: (settings: LEDJobHighlightSettings) => warehouseApi.put('/admin/led/job-highlights', settings),
  getMapping: () => warehouseApi.get<LEDMapping>('/admin/led/mapping'),
  updateMapping: (mapping: LEDMapping) => warehouseApi.put('/admin/led/mapping', mapping),
  validateMapping: (mapping: LEDMapping) => warehouseApi.post('/admin/led/mapping/validate', mapping),
  preview: (appearances: LEDAppearance[], clearBefore: boolean = false, targetBinId?: string) => {
    const payload: Record<string, unknown> = { appearances };
    if (clearBefore) payload.clear_before = true;
    if (targetBinId && targetBinId.trim().length > 0) payload.target_bin_id = targetBinId.trim();
    return warehouseApi.post('/admin/led/preview', payload);
  },
  clear: () => warehouseApi.post('/admin/led/clear'),
  getControllers: () => warehouseApi.get<LEDController[]>('/admin/led/controllers'),
  createController: (payload: LEDControllerPayload) => warehouseApi.post('/admin/led/controllers', payload),
  updateController: (id: number, payload: LEDControllerPayload) => warehouseApi.put(`/admin/led/controllers/${id}`, payload),
  deleteController: (id: number) => warehouseApi.delete(`/admin/led/controllers/${id}`),
  configureController: (id: number, config: { led_count?: number; data_pin?: number; chipset?: string }) =>
    warehouseApi.post(`/admin/led/controllers/${id}/configure`, config),
  restartController: (id: number) => warehouseApi.post(`/admin/led/controllers/${id}/restart`),
};

export const adminSettingsApi = {
  getAPILimits: () => warehouseApi.get<APILimits>('/admin/api-limits'),
  updateAPILimits: (limits: Partial<APILimits>) =>
    warehouseApi.put<APILimits & { message: string }>('/admin/api-limits', {
      device_limit: limits.device_limit,
      case_limit: limits.case_limit,
    }),
};

export const apiKeysAdminApi = {
  list: () => warehouseApi.get<{ keys: APIKeyItem[] }>('/admin/api-keys'),
  create: (payload: { name: string }) =>
    warehouseApi.post<{ keys: APIKeyItem[]; api_key: string } | { api_key: string }>('/admin/api-keys', payload),
  updateStatus: (id: number, is_active: boolean) =>
    warehouseApi.put(`/admin/api-keys/${id}/status`, { is_active }),
  delete: (id: number) => warehouseApi.delete(`/admin/api-keys/${id}`),
};

// ---- Contacts (via RentalCore proxy) ----

export interface Contact {
  customer_id: number;
  companyname?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  email?: string | null;
  phonenumber?: string | null;
  street?: string | null;
  housenumber?: string | null;
  ZIP?: string | null;
  city?: string | null;
  federalstate?: string | null;
  country?: string | null;
  customertype?: string | null;
  is_customer: boolean;
  is_supplier: boolean;
  notes?: string | null;
}

export type ContactPayload = Omit<Contact, 'customer_id'>;

// ---- Service Items (via RentalCore proxy) ----

export interface ServiceItem {
  id: number;
  name: string;
  description?: string | null;
  default_price: number;
  category?: string | null;
  unit: string;
  is_active: boolean;
}

export type ServiceItemPayload = Omit<ServiceItem, 'id' | 'is_active'>;

// The service-items endpoints live under the PDF API namespace in RentalCore
const rentalPdfApi = axios.create({
  baseURL: '/api/v1/proxy/rental/api/pdf',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

export const serviceItemsApi = {
  getAll: () => rentalPdfApi.get<{ service_items: ServiceItem[] }>('/service-items'),
  search: (q: string) => rentalPdfApi.get<{ service_items: ServiceItem[] }>('/service-items/search', { params: { q } }),
  create: (data: ServiceItemPayload) => rentalPdfApi.post<{ service_item_id: number; name: string }>('/service-items', data),
  update: (id: number, data: ServiceItemPayload) => rentalPdfApi.put(`/service-items/${id}`, data),
  delete: (id: number) => rentalPdfApi.delete(`/service-items/${id}`),
};

export const contactsApi = {
  getAll: (params?: { role?: string; q?: string }) =>
    rentalApi.get<{ customers: Contact[] }>('/customers', { params }),
  getById: (id: number) => rentalApi.get<Contact>(`/customers/${id}`),
  create: (data: ContactPayload) => rentalApi.post<{ customer_id: number }>('/customers', data),
  update: (id: number, data: ContactPayload) => rentalApi.put(`/customers/${id}`, data),
  delete: (id: number) => rentalApi.delete(`/customers/${id}`),
};
