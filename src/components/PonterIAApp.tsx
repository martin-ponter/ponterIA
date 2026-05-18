import { useEffect, useMemo, useState } from "react";
import {
    askRag,
    getRagUserDisplayName,
    getRagUserInitials,
    initRagAuth,
    isRagAuthError,
} from "../lib/ragApi";
import {
    validateBitrixAppAccess,
} from "../lib/bitrix";

type ChatItem = {
    id: number;
    title: string;
    preview: string;
    updatedAt: string;
};

type QuickTag = {
    id: string;
    label: string;
};

type RagChatMessage = {
    id: number;
    role: "user" | "assistant";
    content: string;
};

const mockChats: ChatItem[] = [
    {
        id: 1,
        title: "Consulta IVA trimestral",
        preview: "Cómo presentar el impuesto a una SL...",
        updatedAt: "Hace 5 min",
    },
    {
        id: 2,
        title: "Duda sobre cliente internacional",
        preview: "Quién del departamento debe revisar...",
        updatedAt: "Hace 20 min",
    },
    {
        id: 3,
        title: "Onboarding nuevo trabajador",
        preview: "Quién es mi supervisor y cómo escalar...",
        updatedAt: "Ayer",
    },
    {
        id: 4,
        title: "Precios servicio contable",
        preview: "Cuánto se suele cobrar por este caso...",
        updatedAt: "Ayer",
    },
    {
        id: 5,
        title: "Procedimiento fiscal empresa",
        preview: "Pasos para tramitar una gestión concreta...",
        updatedAt: "Hace 2 días",
    },
    {
        id: 6,
        title: "Revisión documentación cliente",
        preview: "Checklist y documentación previa para empezar...",
        updatedAt: "Hace 3 días",
    },
    {
        id: 7,
        title: "Consulta sobre supervisor",
        preview: "A quién debo escalar una incidencia interna...",
        updatedAt: "Hace 4 días",
    },
    {
        id: 8,
        title: "Pricing servicio laboral",
        preview: "Rango orientativo para un servicio recurrente...",
        updatedAt: "Hace 5 días",
    },
    {
        id: 9,
        title: "Cliente con operativa internacional",
        preview: "Qué área debe revisar esta consulta especial...",
        updatedAt: "Hace 6 días",
    },
    {
        id: 10,
        title: "Alta de nuevo trabajador",
        preview: "Pasos internos y responsables implicados...",
        updatedAt: "Hace 1 semana",
    },
];

const quickTags: QuickTag[] = [
    { id: "procedimientos", label: "Procedimientos" },
    { id: "equipo", label: "Equipo" },
    { id: "clientes", label: "Clientes" },
    { id: "supervisores", label: "Supervisores" },
    { id: "pricing", label: "Pricing" },
    { id: "onboarding", label: "Onboarding" },
];

type AccessState =
    | { status: "checking" }
    | { status: "allowed" }
    | { status: "blocked"; reason: string };

type BitrixUserState =
    | { status: "loading"; label: string; initials: string; avatarUrl: string }
    | { status: "ready"; label: string; initials: string; avatarUrl: string }
    | { status: "error"; label: string; initials: string; avatarUrl: string };

export default function PonterIAApp() {
    const [accessState, setAccessState] = useState<AccessState>({
        status: "checking",
    });
    const [bitrixUser, setBitrixUser] = useState<BitrixUserState>({
        status: "loading",
        label: "Cargando usuario...",
        initials: "...",
        avatarUrl: "",
    });
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchValue, setSearchValue] = useState("");
    const [message, setMessage] = useState("");
    const [ragMessages, setRagMessages] = useState<RagChatMessage[]>([]);
    const [chatError, setChatError] = useState("");
    const [sendingMessage, setSendingMessage] = useState(false);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [activeChatId, setActiveChatId] = useState<number | null>(1);

    useEffect(() => {
        let cancelled = false;

        async function bootBitrix() {
            const access = await validateBitrixAppAccess();

            if (cancelled) return;

            if (!access.allowed) {
                setAccessState({
                    status: "blocked",
                    reason: access.reason,
                });
                return;
            }

            setAccessState({ status: "allowed" });

            if (access.mode === "direct-dev") {
                setBitrixUser({
                    status: "error",
                    label: "Usuario de Bitrix no disponible",
                    initials: "BT",
                    avatarUrl: "",
                });
                return;
            }

            try {
                const user = await initRagAuth();

                if (cancelled) return;

                const label = getRagUserDisplayName(user);

                setBitrixUser({
                    status: "ready",
                    label,
                    initials: getRagUserInitials(label),
                    avatarUrl: "",
                });
            } catch (error) {
                if (cancelled) return;

                setBitrixUser({
                    status: "error",
                    label: "Usuario de Bitrix no disponible",
                    initials: "BT",
                    avatarUrl: "",
                });
                setChatError(
                    error instanceof Error
                        ? error.message
                        : "No se pudo autenticar con el RAG.",
                );
            }
        }

        bootBitrix();

        return () => {
            cancelled = true;
        };
    }, []);

    const filteredChats = useMemo(() => {
        const term = searchValue.trim().toLowerCase();

        if (!term) return mockChats;

        return mockChats.filter((chat) => {
            const fullText = `${chat.title} ${chat.preview}`.toLowerCase();
            return fullText.includes(term);
        });
    }, [searchValue]);

    function handleToggleSidebar() {
        setSidebarOpen((prev) => !prev);
        if (sidebarOpen) {
            setSearchOpen(false);
        }
    }

    function handleOpenSearch() {
        setSidebarOpen(true);
        setSearchOpen(true);
    }

    function handleNewChat() {
        setActiveChatId(null);
        setMessage("");
        setChatError("");
        setRagMessages([]);
    }

    async function handleSendMessage() {
        const cleanMessage = message.trim();

        if (!cleanMessage || sendingMessage) return;

        setMessage("");
        setChatError("");
        setSendingMessage(true);
        setRagMessages((prev) => [
            ...prev,
            {
                id: Date.now(),
                role: "user",
                content: cleanMessage,
            },
        ]);

        try {
            const answer = await sendRagMessageWithRefresh(cleanMessage);

            setRagMessages((prev) => [
                ...prev,
                {
                    id: Date.now() + 1,
                    role: "assistant",
                    content: answer,
                },
            ]);
        } catch (error) {
            setChatError(
                error instanceof Error
                    ? error.message
                    : "No se pudo enviar el mensaje.",
            );
        } finally {
            setSendingMessage(false);
        }
    }

    async function sendRagMessageWithRefresh(cleanMessage: string) {
        try {
            return await askRag(cleanMessage);
        } catch (error) {
            if (error instanceof Error && isRagAuthError(error.message)) {
                const user = await initRagAuth();
                const label = getRagUserDisplayName(user);

                setBitrixUser({
                    status: "ready",
                    label,
                    initials: getRagUserInitials(label),
                    avatarUrl: "",
                });

                return askRag(cleanMessage);
            }

            throw error;
        }
    }

    function toggleTag(tagId: string) {
        setSelectedTags((prev) =>
            prev.includes(tagId)
                ? prev.filter((item) => item !== tagId)
                : [...prev, tagId],
        );
    }

    if (accessState.status === "checking") {
        return <CenteredStatus message="Conectando con Bitrix24..." />;
    }

    if (accessState.status === "blocked") {
        return (
            <CenteredStatus
                message="Esta aplicacion solo puede abrirse desde Bitrix24."
                detail={accessState.reason}
            />
        );
    }

    return (
        <div className="h-screen w-screen overflow-hidden bg-[#edf6f1] text-slate-900">
            <div className="flex h-full w-full">
                <aside
                    className={[
                        "relative flex h-full shrink-0 flex-col border-r border-slate-200/80 bg-white/88 shadow-[0_0_0_1px_rgba(255,255,255,0.55)] backdrop-blur-xl transition-all duration-300",
                        sidebarOpen
                            ? "w-[300px] sm:w-[320px]"
                            : "w-[84px] sm:w-[92px]",
                    ].join(" ")}
                >
                    <div className="flex h-full min-h-0 flex-col p-4 sm:p-5">
                        <div
                            className={`mb-5 flex items-center ${
                                sidebarOpen
                                    ? "justify-between"
                                    : "justify-center"
                            }`}
                        >
                            <button
                                type="button"
                                onClick={() => setSidebarOpen(true)}
                                className="group flex items-center gap-3"
                                aria-label="Abrir menú"
                                title="Abrir menú"
                            >
                                <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-white transition group-hover:border-[#69daa3]">
                                    <span
                                        className={[
                                            "absolute inset-0 flex items-center justify-center transition-all duration-200",
                                            sidebarOpen
                                                ? "opacity-100 scale-100"
                                                : "opacity-100 scale-100 group-hover:opacity-0 group-hover:scale-75",
                                        ].join(" ")}
                                    >
                                        <img
                                            src="/LogoPonter_Verde.png"
                                            alt="Logo Ponter"
                                            className="h-8 w-8 object-contain"
                                        />
                                    </span>

                                    {!sidebarOpen && (
                                        <span className="absolute inset-0 flex items-center justify-center opacity-0 scale-75 text-slate-600 transition-all duration-200 group-hover:opacity-100 group-hover:scale-100">
                                            <ChevronRightIcon />
                                        </span>
                                    )}
                                </div>

                                {sidebarOpen && (
                                    <div className="hidden flex-col sm:flex">
                                        <span className="text-sm font-semibold tracking-wide text-slate-900">
                                            Ponter IA
                                        </span>
                                        <span className="text-xs text-slate-500">
                                            Asistente interno
                                        </span>
                                    </div>
                                )}
                            </button>

                            {sidebarOpen && (
                                <button
                                    type="button"
                                    onClick={handleToggleSidebar}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
                                    aria-label="Cerrar menú"
                                    title="Cerrar menú"
                                >
                                    <CloseIcon />
                                </button>
                            )}
                        </div>

                        <nav className="shrink-0 space-y-2">
                            <SidebarActionButton
                                collapsed={!sidebarOpen}
                                icon={<NewChatIcon />}
                                label="Nuevo chat"
                                onClick={handleNewChat}
                            />

                            <SidebarActionButton
                                collapsed={!sidebarOpen}
                                icon={<SearchIcon />}
                                label="Buscar chat"
                                onClick={handleOpenSearch}
                                active={searchOpen}
                            />

                            <SidebarActionButton
                                collapsed={!sidebarOpen}
                                icon={<HistoryIcon />}
                                label="Últimos chats"
                                onClick={() => {
                                    setSidebarOpen(true);
                                    setSearchOpen(false);
                                }}
                            />
                        </nav>

                        {sidebarOpen && searchOpen && (
                            <div className="mt-4 shrink-0">
                                <div className="relative">
                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                        <SearchIcon small />
                                    </span>
                                    <input
                                        value={searchValue}
                                        onChange={(e) =>
                                            setSearchValue(e.target.value)
                                        }
                                        placeholder="Buscar conversación..."
                                        className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[#69daa3] focus:ring-4 focus:ring-[#69daa3]/15"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="mt-6 min-h-0 flex-1 overflow-hidden">
                            {sidebarOpen ? (
                                <div
                                    key="sidebar-open"
                                    className="flex h-full min-h-0 flex-col"
                                >
                                    <p className="mb-3 shrink-0 px-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                                        Conversaciones recientes
                                    </p>

                                    <div className="ponter-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-3">
                                        {filteredChats.map((chat) => {
                                            const active =
                                                activeChatId === chat.id;

                                            return (
                                                <button
                                                    key={`open-${chat.id}`}
                                                    type="button"
                                                    onClick={() =>
                                                        setActiveChatId(chat.id)
                                                    }
                                                    className={[
                                                        "w-full rounded-2xl border p-3 text-left transition",
                                                        active
                                                            ? "border-[#69daa3]/60 bg-[#69daa3]/10 shadow-[0_10px_30px_rgba(105,218,163,0.08)]"
                                                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                                                    ].join(" ")}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-medium text-slate-900">
                                                                {chat.title}
                                                            </p>
                                                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                                                                {chat.preview}
                                                            </p>
                                                        </div>

                                                        <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                                                            {chat.updatedAt}
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div
                                    key="sidebar-collapsed"
                                    className="flex h-full min-h-0 flex-col items-center pt-1"
                                />
                            )}
                        </div>
                    </div>
                </aside>

                <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f7fbf8]">
                    <AuroraBackground />

                    <div className="relative z-10 flex items-center justify-end gap-3 border-b border-slate-200/80 px-4 py-4 sm:px-6 lg:px-8">
                        <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white/85 px-3 py-2 shadow-sm backdrop-blur-md">
                            <Avatar
                                avatarUrl={bitrixUser.avatarUrl}
                                initials={bitrixUser.initials}
                            />
                            <div className="hidden text-right sm:block">
                                <p className="text-sm font-medium text-slate-900">
                                    {bitrixUser.label}
                                </p>
                                <p className="text-xs text-slate-500">
                                    {bitrixUser.status === "loading"
                                        ? "Conectando con Bitrix24"
                                        : "Usuario actual"}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
                        <div className="w-full max-w-5xl">
                            <div className="mx-auto mb-8 max-w-3xl text-center">
                                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#69daa3]/35 bg-white/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#2f8d69] shadow-sm backdrop-blur-md">
                                    <span className="h-2 w-2 rounded-full bg-[#69daa3]" />
                                    Ponter IA
                                </div>

                                <h1 className="text-balance text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl lg:text-6xl">
                                    ¿En qué te puedo ayudar hoy?
                                </h1>

                                <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                                    Resuelve dudas internas, consulta
                                    procedimientos, encuentra responsables y
                                    prepara mejor cada consulta de cliente.
                                </p>
                            </div>

                            <div className="mx-auto max-w-4xl">
                                <div className="rounded-[30px] border border-white/60 bg-white/72 p-3 shadow-[0_30px_80px_rgba(86,113,113,0.10)] backdrop-blur-2xl">
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-stretch gap-3">
                                            <div className="relative flex-1">
                                                <textarea
                                                    value={message}
                                                    onChange={(e) =>
                                                        setMessage(
                                                            e.target.value,
                                                        )
                                                    }
                                                    rows={3}
                                                    placeholder="Pregunta lo que quieras..."
                                                    disabled={
                                                        sendingMessage ||
                                                        bitrixUser.status !==
                                                            "ready"
                                                    }
                                                    className="min-h-[88px] w-full resize-none rounded-[24px] border border-slate-200 bg-white px-5 py-4 pr-14 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[#69daa3] focus:ring-4 focus:ring-[#69daa3]/15 sm:text-base"
                                                />

                                                <button
                                                    type="button"
                                                    onClick={handleSendMessage}
                                                    disabled={
                                                        sendingMessage ||
                                                        !message.trim() ||
                                                        bitrixUser.status !==
                                                            "ready"
                                                    }
                                                    className="absolute bottom-3 right-3 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#69daa3]/40 bg-[#69daa3]/15 text-[#2f8d69] transition hover:border-[#69daa3]/70 hover:bg-[#69daa3]/25 disabled:cursor-not-allowed disabled:opacity-45"
                                                    aria-label="Enviar"
                                                    title="Enviar"
                                                >
                                                    <SendIcon />
                                                </button>
                                            </div>
                                        </div>

                                        {(ragMessages.length > 0 ||
                                            chatError ||
                                            sendingMessage) && (
                                            <div className="max-h-64 space-y-3 overflow-y-auto px-1 py-1">
                                                {ragMessages.map((item) => (
                                                    <div
                                                        key={item.id}
                                                        className={[
                                                            "rounded-2xl border px-4 py-3 text-sm leading-6",
                                                            item.role ===
                                                            "user"
                                                                ? "ml-auto max-w-[82%] border-[#69daa3]/30 bg-[#69daa3]/10 text-slate-800"
                                                                : "mr-auto max-w-[88%] border-slate-200 bg-white text-slate-700",
                                                        ].join(" ")}
                                                    >
                                                        {item.content}
                                                    </div>
                                                ))}

                                                {sendingMessage && (
                                                    <div className="mr-auto max-w-[88%] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-500">
                                                        Consultando Ponter IA...
                                                    </div>
                                                )}

                                                {chatError && (
                                                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                                                        {chatError}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {quickTags.map((tag) => {
                                                const active =
                                                    selectedTags.includes(
                                                        tag.id,
                                                    );

                                                return (
                                                    <button
                                                        key={tag.id}
                                                        type="button"
                                                        onClick={() =>
                                                            toggleTag(tag.id)
                                                        }
                                                        className={[
                                                            "rounded-full border px-4 py-2 text-xs font-medium transition sm:text-sm",
                                                            active
                                                                ? "border-[#69daa3]/40 bg-[#69daa3]/14 text-[#2f8d69]"
                                                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
                                                        ].join(" ")}
                                                    >
                                                        {tag.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}

function CenteredStatus({
    message,
    detail,
}: {
    message: string;
    detail?: string;
}) {
    return (
        <main className="flex h-screen w-screen items-center justify-center bg-[#edf6f1] px-6 text-slate-900">
            <section className="w-full max-w-md rounded-[28px] border border-white/70 bg-white/80 p-8 text-center shadow-[0_30px_80px_rgba(86,113,113,0.10)] backdrop-blur-xl">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-[#69daa3]/35 bg-[#69daa3]/15">
                    <img
                        src="/LogoPonter_Verde.png"
                        alt="Logo Ponter"
                        className="h-9 w-9 object-contain"
                    />
                </div>
                <h1 className="text-xl font-semibold text-slate-950">
                    {message}
                </h1>
                {detail && detail !== message && (
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                        {detail}
                    </p>
                )}
            </section>
        </main>
    );
}

function SidebarActionButton({
    icon,
    label,
    collapsed,
    onClick,
    active = false,
}: {
    icon: React.ReactNode;
    label: string;
    collapsed: boolean;
    onClick?: () => void;
    active?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            className={[
                "group flex w-full items-center rounded-2xl border transition",
                collapsed
                    ? "justify-center px-0 py-3"
                    : "justify-start gap-3 px-3 py-3",
                active
                    ? "border-[#69daa3]/50 bg-[#69daa3]/10 text-[#2f8d69]"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950",
            ].join(" ")}
        >
            <span className="inline-flex h-5 w-5 items-center justify-center">
                {icon}
            </span>

            {!collapsed && (
                <span className="text-sm font-medium tracking-wide">
                    {label}
                </span>
            )}
        </button>
    );
}

function InfoCard({
    title,
    description,
    icon,
}: {
    title: string;
    description: string;
    icon: React.ReactNode;
}) {
    return (
        <div className="rounded-[28px] border border-white/70 bg-white/72 p-5 shadow-[0_18px_50px_rgba(86,113,113,0.08)] backdrop-blur-xl transition hover:border-white hover:bg-white/85">
            <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#69daa3]/30 bg-[#69daa3]/12 text-[#2f8d69]">
                {icon}
            </div>

            <h3 className="text-sm font-semibold text-slate-900 sm:text-base">
                {title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
                {description}
            </p>
        </div>
    );
}

function Avatar({
    avatarUrl,
    initials,
}: {
    avatarUrl?: string;
    initials: string;
}) {
    if (avatarUrl) {
        return (
            <img
                src={avatarUrl}
                alt="Avatar usuario"
                className="h-11 w-11 rounded-full border border-slate-200 object-cover"
            />
        );
    }

    return (
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700">
            {initials}
        </div>
    );
}

function AuroraBackground() {
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="aurora-blob aurora-blob-1 absolute left-[-14%] top-[4%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(105,218,163,0.20)_0%,rgba(105,218,163,0.12)_28%,rgba(105,218,163,0.05)_52%,rgba(105,218,163,0)_74%)] blur-[85px]" />

            <div className="aurora-blob aurora-blob-2 absolute right-[-12%] top-[10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(86,113,113,0.14)_0%,rgba(86,113,113,0.09)_30%,rgba(86,113,113,0.04)_54%,rgba(86,113,113,0)_76%)] blur-[95px]" />

            <div className="aurora-blob aurora-blob-3 absolute bottom-[-8%] left-[18%] h-[340px] w-[520px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(105,218,163,0.12)_0%,rgba(105,218,163,0.07)_30%,rgba(105,218,163,0.03)_56%,rgba(105,218,163,0)_78%)] blur-[110px]" />

            <div className="aurora-wave-layer aurora-wave-layer-1 absolute inset-0">
                <svg
                    viewBox="0 0 1600 900"
                    className="h-full w-full opacity-80"
                    preserveAspectRatio="none"
                >
                    <defs>
                        <linearGradient
                            id="waveLight1"
                            x1="0%"
                            y1="0%"
                            x2="100%"
                            y2="0%"
                        >
                            <stop
                                offset="0%"
                                stopColor="#69daa3"
                                stopOpacity="0"
                            />
                            <stop
                                offset="22%"
                                stopColor="#69daa3"
                                stopOpacity="0.55"
                            />
                            <stop
                                offset="48%"
                                stopColor="#9ff0c8"
                                stopOpacity="0.8"
                            />
                            <stop
                                offset="74%"
                                stopColor="#567171"
                                stopOpacity="0.45"
                            />
                            <stop
                                offset="100%"
                                stopColor="#567171"
                                stopOpacity="0"
                            />
                        </linearGradient>

                        <filter id="glowLight1">
                            <feGaussianBlur stdDeviation="7" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    <path
                        d="M-50 445 C 170 405, 210 555, 380 430 C 560 295, 760 355, 925 445 C 1080 530, 1210 395, 1360 420 C 1485 442, 1555 465, 1670 420"
                        fill="none"
                        stroke="url(#waveLight1)"
                        strokeWidth="3"
                        filter="url(#glowLight1)"
                        opacity="0.58"
                    />
                </svg>
            </div>

            <div className="aurora-wave-layer aurora-wave-layer-2 absolute inset-0">
                <svg
                    viewBox="0 0 1600 900"
                    className="h-full w-full opacity-70"
                    preserveAspectRatio="none"
                >
                    <defs>
                        <linearGradient
                            id="waveLight2"
                            x1="0%"
                            y1="0%"
                            x2="100%"
                            y2="0%"
                        >
                            <stop
                                offset="0%"
                                stopColor="#69daa3"
                                stopOpacity="0"
                            />
                            <stop
                                offset="22%"
                                stopColor="#69daa3"
                                stopOpacity="0.45"
                            />
                            <stop
                                offset="48%"
                                stopColor="#9ff0c8"
                                stopOpacity="0.7"
                            />
                            <stop
                                offset="74%"
                                stopColor="#567171"
                                stopOpacity="0.35"
                            />
                            <stop
                                offset="100%"
                                stopColor="#567171"
                                stopOpacity="0"
                            />
                        </linearGradient>

                        <filter id="glowLight2">
                            <feGaussianBlur stdDeviation="7" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    <path
                        d="M-90 530 C 140 490, 240 610, 430 500 C 610 395, 760 385, 935 505 C 1085 605, 1255 455, 1400 480 C 1515 500, 1600 535, 1710 500"
                        fill="none"
                        stroke="url(#waveLight2)"
                        strokeWidth="2.2"
                        filter="url(#glowLight2)"
                        opacity="0.35"
                    />
                </svg>
            </div>

            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(247,251,248,0.28),rgba(247,251,248,0.72))]" />
        </div>
    );
}
function CloseIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
        >
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
    );
}

function ChevronRightIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
        >
            <path
                d="M9 6l6 6-6 6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function NewChatIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
        >
            <path
                d="M8 7h5a4 4 0 014 4v6a2 2 0 01-2 2H9a4 4 0 01-4-4V9a2 2 0 012-2z"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path d="M14 4v6M11 7h6" strokeLinecap="round" />
        </svg>
    );
}

function SearchIcon({ small = false }: { small?: boolean }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={small ? "h-4 w-4" : "h-5 w-5"}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
        >
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4 4" strokeLinecap="round" />
        </svg>
    );
}

function HistoryIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
        >
            <path
                d="M4 12a8 8 0 108-8 8.5 8.5 0 00-6 2.5"
                strokeLinecap="round"
            />
            <path d="M4 4v5h5" strokeLinecap="round" strokeLinejoin="round" />
            <path
                d="M12 8v4l2.5 2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function SendIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
        >
            <path
                d="M4 11.5l14.5-6c1-.4 1.9.5 1.5 1.5l-6 14.5c-.4 1-1.8 1.1-2.2.1l-2.2-5.3-5.3-2.2c-1-.4-.9-1.8.1-2.2z"
                strokeLinejoin="round"
            />
            <path d="M10 16l4-4" strokeLinecap="round" />
        </svg>
    );
}

function SparklesIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
        >
            <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z" />
            <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
            <path d="M6 16l.8 2.2L9 19l-2.2.8L6 22l-.8-2.2L3 19l2.2-.8L6 16z" />
        </svg>
    );
}

function DocumentIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
        >
            <path
                d="M8 3h6l5 5v10a3 3 0 01-3 3H8a3 3 0 01-3-3V6a3 3 0 013-3z"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path d="M14 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 13h6M9 17h4" strokeLinecap="round" />
        </svg>
    );
}

function UsersIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
        >
            <path d="M16 19a4 4 0 00-8 0" strokeLinecap="round" />
            <circle cx="12" cy="10" r="3" />
            <path d="M20 19a3.5 3.5 0 00-2.5-3.35" strokeLinecap="round" />
            <path d="M6.5 15.65A3.5 3.5 0 004 19" strokeLinecap="round" />
            <path d="M17 7.5a2.5 2.5 0 010 5" strokeLinecap="round" />
            <path d="M7 7.5a2.5 2.5 0 000 5" strokeLinecap="round" />
        </svg>
    );
}

function BriefcaseIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
        >
            <path
                d="M9 7V6a2 2 0 012-2h2a2 2 0 012 2v1"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M5 8h14a2 2 0 012 2v6a3 3 0 01-3 3H6a3 3 0 01-3-3v-6a2 2 0 012-2z"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path d="M3 12h18" strokeLinecap="round" />
        </svg>
    );
}
