import { useParams, Navigate } from 'react-router-dom';
import { ContactsTab } from '../components/admin/ContactsTab';
import { ServiceItemsTab } from '../components/admin/ServiceItemsTab';
import { UsersTab } from '../components/admin/UsersTab';
import { ZoneTypesTab } from '../components/admin/ZoneTypesTab';
import { LEDSettingsTab } from '../components/admin/LEDSettingsTab';
import { LEDControllersTab } from '../components/admin/LEDControllersTab';
import { CategoriesTab } from '../components/admin/CategoriesTab';
import { BrandsManufacturersTab } from '../components/admin/BrandsManufacturersTab';
import { CountTypesTab } from '../components/admin/CountTypesTab';
import { CablesTab } from '../components/admin/CablesTab';
import { RentalFieldsTab } from '../components/admin/RentalFieldsTab';
import { RolesTab } from '../components/admin/RolesTab';
import { APISettingsTab } from '../components/admin/APISettingsTab';
import { APIKeysTab } from '../components/admin/APIKeysTab';
import { ExportTab } from '../components/admin/ExportTab';

const tabComponents: Record<string, React.ElementType> = {
  contacts: ContactsTab,
  services: ServiceItemsTab,
  users: UsersTab,
  roles: RolesTab,
  zonetypes: ZoneTypesTab,
  led: LEDSettingsTab,
  controllers: LEDControllersTab,
  categories: CategoriesTab,
  brands: BrandsManufacturersTab,
  counttypes: CountTypesTab,
  cables: CablesTab,
  rentalfields: RentalFieldsTab,
  apisettings: APISettingsTab,
  apikeys: APIKeysTab,
  export: ExportTab,
};

export function AdminPage() {
  const { tab = 'users' } = useParams<{ tab: string }>();
  const Component = tabComponents[tab];

  if (!Component) return <Navigate to="/admin/users" replace />;

  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
      <Component />
    </div>
  );
}
