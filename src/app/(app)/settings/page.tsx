import { ProviderSettings } from "@/components/provider-settings";
import { AccountSettings } from "@/components/account-settings";
import { ThemeToggle } from "@/components/theme-toggle";
import { PageSection } from "@/components/ui";

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-section">
      <h1 className="font-display text-2xl font-light tracking-tight">
        Configuración de cuenta
      </h1>

      <PageSection
        first
        title="Apariencia"
        description="Elige si quieres la app en claro u oscuro. Si no eliges, sigue el tema de tu sistema."
      >
        <ThemeToggle />
      </PageSection>

      <PageSection
        id="tarjetas"
        title="Tarjetas"
        description="Edita el nombre de tus tarjetas, agrega nuevas o elimínalas. Eliminar una tarjeta borra también sus estados de cuenta y transacciones asociadas."
      >
        <AccountSettings />
      </PageSection>

      <PageSection
        title="Proveedores de IA"
        description="Elige qué modelo de IA quieres usar para leer tus estados de cuenta y para el chatbot, y conecta tu propia API key."
      >
        <ProviderSettings />
      </PageSection>
    </main>
  );
}
