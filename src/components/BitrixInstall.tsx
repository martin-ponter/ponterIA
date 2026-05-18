import { useEffect, useState } from "react";
import { finishBitrixInstallation } from "../lib/bitrix";

type InstallState =
    | { status: "installing"; message: string }
    | { status: "done"; message: string }
    | { status: "error"; message: string };

export default function BitrixInstall() {
    const [installState, setInstallState] = useState<InstallState>({
        status: "installing",
        message: "Instalando aplicacion en Bitrix24...",
    });

    useEffect(() => {
        let cancelled = false;

        async function install() {
            try {
                await finishBitrixInstallation();

                if (cancelled) return;

                setInstallState({
                    status: "done",
                    message: "Instalacion finalizada correctamente.",
                });
            } catch (error) {
                if (cancelled) return;

                setInstallState({
                    status: "error",
                    message:
                        error instanceof Error
                            ? error.message
                            : "No se pudo finalizar la instalacion.",
                });
            }
        }

        install();

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <main className="flex min-h-screen items-center justify-center bg-[#edf6f1] px-6 text-slate-900">
            <section className="w-full max-w-md rounded-[28px] border border-white/70 bg-white/80 p-8 text-center shadow-[0_30px_80px_rgba(86,113,113,0.10)] backdrop-blur-xl">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-[#69daa3]/35 bg-[#69daa3]/15">
                    <img
                        src="/LogoPonter_Verde.png"
                        alt="Logo Ponter"
                        className="h-9 w-9 object-contain"
                    />
                </div>

                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2f8d69]">
                    Bitrix24
                </p>
                <h1 className="mt-3 text-xl font-semibold text-slate-950">
                    {installState.message}
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                    {installState.status === "installing" &&
                        "Espera unos segundos mientras se inicializa el SDK."}
                    {installState.status === "done" &&
                        "Ya puedes cerrar esta pantalla y abrir Ponter IA desde Bitrix24."}
                    {installState.status === "error" &&
                        "Abre esta ruta desde el instalador de Bitrix24 para completar el proceso."}
                </p>
            </section>
        </main>
    );
}
