import { CustomToolbarVariant, AlvToolbarButton } from '../types/sap';

const STORAGE_KEY = 'sap_custom_toolbar_variants';

export const PREDEFINED_TOOLBAR_VARIANTS: CustomToolbarVariant[] = [
  {
    id: 'DEFAULT_EMPTY',
    name: 'Default Blank Toolbar',
    description: 'Default state with no custom toolbar buttons.',
    is_builtin: true,
    buttons: [],
  },
  {
    id: '/SD_SALES_ORDER',
    name: 'SD Sales & Delivery',
    description: 'Confirm Order, Create Delivery, Issue Billing, Print Note',
    is_builtin: true,
    buttons: [
      {
        id: 'cust-sd-01',
        function: 'ZORD_CONF',
        text: 'Confirm Order',
        quickinfo: 'Approve and confirm sales order status',
        icon: 'ICON_CHECKED',
        disabled: false,
        visible: true,
        is_standard: false,
        separator_before: false,
      },
      {
        id: 'cust-sd-02',
        function: 'ZDELIV_CREATE',
        text: 'Create Delivery',
        quickinfo: 'Create outbound delivery document (VL01N)',
        icon: 'ICON_DELIVERY',
        disabled: false,
        visible: true,
        is_standard: false,
        separator_before: false,
      },
      {
        id: 'cust-sd-03',
        function: 'ZBILL_ISSUE',
        text: 'Billing Doc',
        quickinfo: 'Create billing document and tax invoice (VF01)',
        icon: 'ICON_INVOICE',
        disabled: false,
        visible: true,
        is_standard: false,
        separator_before: false,
      },
      {
        id: 'cust-sd-04',
        function: 'ZPRINT_BL',
        text: 'Delivery Note',
        quickinfo: 'Print delivery note or export PDF',
        icon: 'ICON_PRINT',
        disabled: false,
        visible: true,
        is_standard: false,
        separator_before: true,
      },
    ],
  },
  {
    id: '/MM_INVENTORY',
    name: 'MM Inventory & Stock',
    description: 'Goods Issue, Stock Transfer, Physical Inv, Reorder PR',
    is_builtin: true,
    buttons: [
      {
        id: 'cust-mm-01',
        function: 'ZGOODS_ISSUE',
        text: 'Goods Issue',
        quickinfo: 'Post goods issue for production/consumption (mvt 201/261)',
        icon: 'ICON_OUTBOUND',
        disabled: false,
        visible: true,
        is_standard: false,
        separator_before: false,
      },
      {
        id: 'cust-mm-02',
        function: 'ZSTOCK_TRANS',
        text: 'Stock Transfer',
        quickinfo: 'Post stock transfer between plants/SLoc (mvt 311)',
        icon: 'ICON_TRANSFER',
        disabled: false,
        visible: true,
        is_standard: false,
        separator_before: false,
      },
      {
        id: 'cust-mm-03',
        function: 'ZPHYS_INV',
        text: 'Post Count',
        quickinfo: 'Post physical inventory differences and confirm book stock',
        icon: 'ICON_COUNT',
        disabled: false,
        visible: true,
        is_standard: false,
        separator_before: false,
      },
      {
        id: 'cust-mm-04',
        function: 'ZREORDER_ALERT',
        text: 'Create PR',
        quickinfo: 'Auto-generate purchase requisition (PR) below safety stock',
        icon: 'ICON_ALERT',
        disabled: false,
        visible: true,
        is_standard: false,
        separator_before: true,
      },
    ],
  },
  {
    id: '/FI_JOURNAL',
    name: 'FI Financial & Posting',
    description: 'Post Doc, Reverse Doc, Payment Proposal, Tax E-Invoice',
    is_builtin: true,
    buttons: [
      {
        id: 'cust-fi-01',
        function: 'ZDOC_POST',
        text: 'Post Doc',
        quickinfo: 'Batch post G/L accounting documents (FB50/F-02)',
        icon: 'ICON_POST',
        disabled: false,
        visible: true,
        is_standard: false,
        separator_before: false,
      },
      {
        id: 'cust-fi-02',
        function: 'ZREVERSE',
        text: 'Reverse Doc',
        quickinfo: 'Reverse FI document and reset clearing (FB08)',
        icon: 'ICON_CANCEL',
        disabled: false,
        visible: true,
        is_standard: false,
        separator_before: false,
      },
      {
        id: 'cust-fi-03',
        function: 'ZPAY_PROP',
        text: 'Payment Run',
        quickinfo: 'Generate automatic payment proposal (F110)',
        icon: 'ICON_PAYMENT',
        disabled: false,
        visible: true,
        is_standard: false,
        separator_before: false,
      },
      {
        id: 'cust-fi-04',
        function: 'ZTAX_INVOICE',
        text: 'Send E-Tax',
        quickinfo: 'Submit batch electronic tax invoices via API',
        icon: 'ICON_CALC',
        disabled: false,
        visible: true,
        is_standard: false,
        separator_before: true,
      },
    ],
  },
  {
    id: '/DATA_ANALYTICS',
    name: 'Export & BI Analytics',
    description: 'CSV Export, Pivot Analysis, Send Email, ERP RFC Sync',
    is_builtin: true,
    buttons: [
      {
        id: 'cust-bi-01',
        function: 'ZDOWNLOAD_CSV',
        text: 'CSV Export',
        quickinfo: 'Download raw dataset as CSV file',
        icon: 'ICON_EXPORT',
        disabled: false,
        visible: true,
        is_standard: false,
        separator_before: false,
      },
      {
        id: 'cust-bi-02',
        function: 'ZPIVOT_VIEW',
        text: 'Pivot View',
        quickinfo: 'Switch to multi-dimensional pivot summary view',
        icon: 'ICON_CALC',
        disabled: false,
        visible: true,
        is_standard: false,
        separator_before: false,
      },
      {
        id: 'cust-bi-03',
        function: 'ZEMAIL_SEND',
        text: 'Send Email',
        quickinfo: 'Email query results to recipients',
        icon: 'ICON_MAIL',
        disabled: false,
        visible: true,
        is_standard: false,
        separator_before: false,
      },
      {
        id: 'cust-bi-04',
        function: 'ZSYNC_ERP',
        text: 'ERP Sync',
        quickinfo: 'Sync live data via SAP backend RFC',
        icon: 'ICON_REFRESH',
        disabled: false,
        visible: true,
        is_standard: false,
        separator_before: true,
      },
    ],
  },
];

export function getToolbarVariants(): CustomToolbarVariant[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const userVariants: CustomToolbarVariant[] = JSON.parse(saved);
      // Combine builtins + user variants (filtering duplicates by id)
      const userIds = new Set(userVariants.map((v) => v.id));
      const builtins = PREDEFINED_TOOLBAR_VARIANTS.filter((v) => !userIds.has(v.id));
      return [...builtins, ...userVariants];
    }
  } catch (e) {
    console.error('Failed to load toolbar variants from localStorage', e);
  }
  return PREDEFINED_TOOLBAR_VARIANTS;
}

export function saveUserToolbarVariant(variant: CustomToolbarVariant): CustomToolbarVariant[] {
  const current = getToolbarVariants();
  const existingIndex = current.findIndex((v) => v.id === variant.id);
  let updated: CustomToolbarVariant[];

  if (existingIndex >= 0) {
    updated = current.map((v, i) => (i === existingIndex ? { ...variant, is_builtin: false } : v));
  } else {
    updated = [...current, { ...variant, is_builtin: false }];
  }

  // Persist only non-builtin or modified variants
  const userOnly = updated.filter((v) => !v.is_builtin);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userOnly));
  } catch (e) {
    console.error('Failed to save toolbar variants to localStorage', e);
  }

  return updated;
}

export function deleteUserToolbarVariant(variantId: string): CustomToolbarVariant[] {
  const current = getToolbarVariants();
  const updated = current.filter((v) => v.id !== variantId || v.is_builtin);
  const userOnly = updated.filter((v) => !v.is_builtin);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userOnly));
  } catch (e) {
    console.error('Failed to delete toolbar variant from localStorage', e);
  }

  return getToolbarVariants();
}
