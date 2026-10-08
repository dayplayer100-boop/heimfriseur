export interface Base {
  id: string;
  user_id: string;
  business_id?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}
export interface Profile extends Base {
  business_name: string;
  first_name: string;
  last_name: string;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  phone: string;
  email: string;
  logo_url: string;
}
export interface Facility extends Base {
  price_list_customized?: boolean;
  visit_recurrence_weeks?: number;
  preferred_weekday?: number;
  preferred_start_time?: string;
  is_provisional?: boolean;
  name: string;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  phone: string;
  email: string;
  contact_name: string;
  contact_phone: string;
  notes: string;
}
export interface Group extends Base {
  is_general?: boolean;
  facility_id: string;
  name: string;
  recurrence_weeks: number;
  preferred_weekday: number;
  preferred_start_time: string;
  notes: string;
}
export interface Customer extends Base {
  temporary_due_date?: string | null;
  rhythm_anchor_date?: string | null;
  recurrence_weeks?: number | null;
  next_due_date?: string | null;
  cohort_id?: string | null;
  hair_request?: "Ja" | "Nein" | "Unbekannt";
  facility_id: string;
  group_id: string;
  first_name: string;
  last_name: string;
  room_number: string;
  status: string;
  notes: string;
  default_duration_minutes?: number;
}
export interface Service extends Base {
  name: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
}
export interface DefaultService extends Base {
  customer_id: string;
  service_id: string;
}
export interface Appointment extends Base {
  selected_customer_id?: string | null;
  auto_include_due?: boolean;
  all_groups?: boolean;
  cohort_id?: string | null;
  facility_id: string;
  group_id: string;
  appointment_date: string;
  start_time: string;
  status: string;
  recurrence_weeks: number | null;
  recurrence_series_id: string | null;
  notes?: string;
  planning_complete?: boolean;
  actual_start_time: string | null;
  actual_end_time: string | null;
}
export interface Member extends Base {
  entry_type?: string;
  followup_date?: string | null;
  appointment_id: string;
  customer_id: string;
  status: string;
  non_completion_reason?: string;
  sort_order: number;
}
export interface Treatment extends Base {
  performed_by?: string;
  appointment_id: string;
  appointment_customer_id: string;
  customer_id: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  total_price: number;
  material_cost: number;
  price_override?: number | null;
  notes: string;
}
export interface TreatmentService extends Base {
  treatment_id: string;
  service_id: string;
  service_name_snapshot: string;
  price_snapshot: number;
  duration_minutes_snapshot: number;
}
export interface Formula extends Base {
  customer_id: string;
  treatment_id?: string | null;
  product: string;
  color_1: string;
  color_1_amount: number | null;
  color_2: string;
  color_2_amount: number | null;
  color_3: string;
  color_3_amount: number | null;
  developer_strength: string;
  developer_amount: number | null;
  processing_time_minutes: number | null;
  notes: string;
  formula_date: string;
}
export interface Cohort extends Base {
  facility_id: string;
  group_id: string;
  name: string;
  recurrence_weeks: number;
  anchor_date: string;
}
export interface FacilityPrice extends Base {
  facility_id: string;
  service_id: string;
  price: number;
}
export interface PaymentMethod extends Base {
  name: string;
  is_active: boolean;
}
export interface Billing extends Base {
  customer_id: string;
  billing_name: string;
  street: string;
  postal_code: string;
  city: string;
  phone: string;
  email: string;
  payment_method_id: string | null;
  delivery: string;
}
export interface Payment extends Base {
  treatment_id: string;
  payment_method_id: string | null;
  method_name_snapshot: string;
  status: string;
  delivery: string;
  billing_name_snapshot: string;
  billing_address_snapshot: string;
  amount: number;
  recorded_by: string;
  recorded_at: string;
}
export interface Feedback extends Base {
  created_by: string;
  category: string;
  message: string;
  route: string;
  status: string;
}
export type Permission =
  | "edit_customers"
  | "add_customers"
  | "edit_schedule"
  | "override_prices"
  | "record_payments"
  | "view_billing"
  | "close_visits";
export interface Data {
  cohorts: Cohort[];
  facility_service_prices: FacilityPrice[];
  payment_methods: PaymentMethod[];
  customer_billing: Billing[];
  treatment_payments: Payment[];
  feedback: Feedback[];
  profiles: Profile[];
  facilities: Facility[];
  groups: Group[];
  customers: Customer[];
  services: Service[];
  customer_default_services: DefaultService[];
  appointments: Appointment[];
  appointment_customers: Member[];
  treatments: Treatment[];
  treatment_services: TreatmentService[];
  color_formulas: Formula[];
}
export type Table = keyof Data;
export type Row = Data[Table][number];
export const emptyData = (): Data => ({
  cohorts: [],
  facility_service_prices: [],
  payment_methods: [],
  customer_billing: [],
  treatment_payments: [],
  feedback: [],
  profiles: [],
  facilities: [],
  groups: [],
  customers: [],
  services: [],
  customer_default_services: [],
  appointments: [],
  appointment_customers: [],
  treatments: [],
  treatment_services: [],
  color_formulas: [],
});

export interface TeamMember {
  id: string;
  business_id: string;
  user_id: string;
  role: "owner" | "employee";
  display_name: string;
  permissions?: Partial<Record<Permission, boolean>>;
  onboarding_completed?: boolean;
  setup_completed?: boolean;
  is_active: boolean;
}
export interface Assignment {
  id: string;
  appointment_id: string;
  user_id: string;
  is_responsible: boolean;
}
export interface TeamContext {
  business: { id: string; owner_user_id: string; name: string };
  membership: TeamMember;
  members: TeamMember[];
  assignments: Assignment[];
  invitations: {
    id: string;
    link_token?: string;
    email: string;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
  }[];
  audit: {
    id: string;
    actor_id: string;
    action: string;
    record_id: string;
    details: Record<string, any>;
    created_at: string;
  }[];
}

export interface AppAdminContext {
  users?: {
    uid: string;
    email: string;
    display_name: string;
    business_id: string | null;
  }[];
  is_admin: boolean;
  selected_business_id?: string | null;
  businesses?: {
    id: string;
    name: string;
    owner_user_id: string;
    owner_email: string;
  }[];
  admins?: { user_id: string; email: string; is_active: boolean }[];
  audit?: {
    id: string;
    action: string;
    actor_id: string | null;
    business_id: string | null;
    target_user_id: string | null;
    created_at: string;
    details: Record<string, unknown>;
  }[];
}
