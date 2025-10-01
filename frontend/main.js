const { createApp, reactive, ref, computed, watch } = Vue;

const API_BASE = '/api/secrets';

const EMPTY_DETAILS = {
  credential: () => ({ site: '', username: '', password: '' }),
  sshKey: () => ({ host: '', publicKey: '', privateKey: '' }),
  creditCard: () => ({ cardholder: '', number: '', expiry: '', cvv: '' }),
  misc: () => ({ description: '', secret: '' })
};

function defaultForm() {
  return {
    id: null,
    type: '',
    name: '',
    details: {},
    notes: ''
  };
}

createApp({
  setup() {
    const secrets = ref([]);
    const filters = reactive({ type: 'all', query: '' });
    const form = reactive(defaultForm());
    const formError = ref('');
    const formSuccess = ref('');

    watch(
      () => form.type,
      (type) => {
        if (type && EMPTY_DETAILS[type]) {
          form.details = { ...EMPTY_DETAILS[type](), notes: form.details.notes || '' };
        } else {
          form.details = {};
        }
      }
    );

    const fetchSecrets = async () => {
      try {
        const response = await fetch(API_BASE);
        if (!response.ok) throw new Error('Failed to load secrets');
        secrets.value = await response.json();
      } catch (error) {
        formError.value = error.message;
      }
    };

    const handleSubmit = async () => {
      if (!form.type || !form.name) {
        formError.value = 'Type and name are required.';
        return;
      }
      formError.value = '';
      formSuccess.value = '';

      const payload = {
        type: form.type,
        name: form.name,
        details: { ...form.details }
      };

      try {
        const response = await fetch(form.id ? `${API_BASE}/${form.id}` : API_BASE, {
          method: form.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
          const message = data?.message || 'Unable to save secret';
          formError.value = Array.isArray(data?.errors) ? `${message}: ${data.errors.join(', ')}` : message;
          return;
        }

        formSuccess.value = form.id ? 'Secret updated successfully.' : 'Secret added successfully.';
        await fetchSecrets();
        resetForm();
      } catch (error) {
        formError.value = error.message;
      }
    };

    const prepareEdit = (secret) => {
      form.id = secret.id;
      form.type = secret.type;
      form.name = secret.name;
      form.details = JSON.parse(JSON.stringify(secret.details));
      formSuccess.value = '';
      formError.value = '';
    };

    const resetForm = () => {
      form.id = null;
      form.type = '';
      form.name = '';
      form.details = {};
      formSuccess.value = '';
      formError.value = '';
    };

    const removeSecret = async (secret) => {
      if (!confirm(`Delete ${secret.name}?`)) return;
      try {
        const response = await fetch(`${API_BASE}/${secret.id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete secret');
        await fetchSecrets();
      } catch (error) {
        formError.value = error.message;
      }
    };

    const filteredSecrets = computed(() => {
      const query = filters.query.trim().toLowerCase();
      return secrets.value.filter((secret) => {
        const matchesType = filters.type === 'all' || secret.type === filters.type;
        const matchesQuery = !query
          ? true
          : secret.name.toLowerCase().includes(query) ||
            Object.values(secret.details || {}).some((value) =>
              typeof value === 'string' && value.toLowerCase().includes(query)
            );
        return matchesType && matchesQuery;
      });
    });

    const formatDate = (iso) => {
      try {
        return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
      } catch (error) {
        return iso;
      }
    };

    const displayType = (type) => {
      return {
        credential: 'Credential',
        sshKey: 'SSH Key',
        creditCard: 'Credit Card',
        misc: 'Misc'
      }[type] || type;
    };

    const prettifyKey = (key) => {
      return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
        .trim();
    };

    const maskValue = (value) => {
      if (typeof value !== 'string') return value;
      if (value.length <= 4) return '*'.repeat(value.length);
      return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
    };

    const sensitiveKeys = ['password', 'privateKey', 'number', 'cvv', 'secret'];
    const shouldMask = (key) => sensitiveKeys.includes(key);

    fetchSecrets();

    return {
      secrets,
      filters,
      form,
      formError,
      formSuccess,
      filteredSecrets,
      handleSubmit,
      resetForm,
      prepareEdit,
      removeSecret,
      displayType,
      formatDate,
      prettifyKey,
      maskValue,
      shouldMask
    };
  }
}).mount('#app');
