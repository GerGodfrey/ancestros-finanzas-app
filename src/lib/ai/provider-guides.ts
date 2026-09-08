// Pasos para conseguir la API key de cada proveedor. Viven aquí y no dentro
// del componente porque son contenido que cambia por su cuenta —los paneles
// de estos servicios se reorganizan— y así se actualiza en un solo lugar.

export interface ProviderGuide {
  /** Dónde se saca la key. */
  url: string;
  urlLabel: string;
  steps: string[];
  /** Con qué empieza la key, para que se note un copiado a medias. */
  keyPrefix: string;
  /** Lo que suele sorprender: si hace falta pagar antes de que funcione. */
  billing: string;
}

export const PROVIDER_GUIDES: Record<string, ProviderGuide> = {
  anthropic: {
    url: "https://console.anthropic.com/settings/keys",
    urlLabel: "console.anthropic.com",
    steps: [
      "Entra a la consola de Anthropic y crea una cuenta o inicia sesión.",
      "Ve a Settings → API keys.",
      "Pulsa «Create Key», ponle un nombre (por ejemplo, «finanzas-app») y créala.",
      "Cópiala completa en cuanto aparezca: la consola no vuelve a mostrarla.",
    ],
    keyPrefix: "sk-ant-",
    billing:
      "Necesitas saldo cargado en Plan & Billing. Sin saldo, la key es válida pero cada llamada falla.",
  },
  openai: {
    url: "https://platform.openai.com/api-keys",
    urlLabel: "platform.openai.com",
    steps: [
      "Entra a la plataforma de OpenAI e inicia sesión.",
      "Abre la sección API keys.",
      "Pulsa «Create new secret key» y confirma.",
      "Cópiala completa en cuanto aparezca: después queda oculta para siempre.",
    ],
    keyPrefix: "sk-",
    billing:
      "Requiere un método de pago en Billing. La cuenta gratuita no alcanza para la API.",
  },
  gemini: {
    url: "https://aistudio.google.com/apikey",
    urlLabel: "aistudio.google.com",
    steps: [
      "Entra a Google AI Studio con tu cuenta de Google.",
      "Abre la sección de API keys.",
      "Pulsa «Create API key» y elige un proyecto de Google Cloud (o deja que cree uno).",
      "Copia la key que aparece.",
    ],
    keyPrefix: "AIza",
    billing:
      "Tiene una capa gratuita con límites de uso; suele bastar para empezar sin tarjeta.",
  },
  deepseek: {
    url: "https://platform.deepseek.com/api_keys",
    urlLabel: "platform.deepseek.com",
    steps: [
      "Entra a la plataforma de DeepSeek y crea una cuenta.",
      "Abre la sección API keys.",
      "Pulsa «Create new API key» y ponle un nombre.",
      "Cópiala completa en cuanto aparezca.",
    ],
    keyPrefix: "sk-",
    billing:
      "Requiere recargar saldo antes de poder usarla; el registro por sí solo no da crédito.",
  },
};
