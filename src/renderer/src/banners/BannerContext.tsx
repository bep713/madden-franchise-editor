import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import Banner, {
    BannerAction,
    BannerSeverity
} from '../components/Banner/Banner';

export interface BannerOptions {
    actions?: BannerAction[];
    durationMs?: number;
    key?: string;
    kind?: string;
    message: string;
    severity: BannerSeverity;
}

interface BannerApi {
    hide: (id: string) => void;
    show: (banner: BannerOptions) => string;
}

interface QueuedBanner extends BannerOptions {
    id: string;
}

type Timer = ReturnType<typeof setTimeout>;

export const DEFAULT_DURATION_MS = 8000;
export const SLIDE_MS = 300;
// v4 waited 20ms before adding the visible class so the transition runs
const ENTER_DELAY_MS = 20;

const BannerContext = createContext<BannerApi>({
    hide: () => {},
    show: () => ''
});

export const useBanner = (): BannerApi => useContext(BannerContext);

interface Props {
    children: React.ReactNode;
}

export const BannerProvider: React.FC<Props> = ({ children }: Props) => {
    const [view, setView] = useState<{
        banner: QueuedBanner;
        visible: boolean;
    } | null>(null);

    const queue = useRef<QueuedBanner[]>([]);
    const current = useRef<QueuedBanner | null>(null);
    const nextId = useRef(0);
    // the current banner is sliding out and can no longer be replaced
    const hiding = useRef(false);
    // the current banner has finished sliding in, so its timer may run
    const shown = useRef(false);
    const hovered = useRef(false);
    const focused = useRef(false);
    const remaining = useRef(DEFAULT_DURATION_MS);
    const startedAt = useRef(0);
    const autoTimer = useRef<Timer>();
    const slideTimer = useRef<Timer>();
    const enterTimer = useRef<Timer>();
    const advanceRef = useRef<() => void>(() => {});

    const clearTimers = useCallback(() => {
        clearTimeout(autoTimer.current);
        clearTimeout(slideTimer.current);
        clearTimeout(enterTimer.current);
        autoTimer.current = undefined;
        slideTimer.current = undefined;
        enterTimer.current = undefined;
    }, []);

    // slides the current banner out, then starts the next one
    const hideCurrent = useCallback(() => {
        if (!current.current || hiding.current) return;
        hiding.current = true;
        shown.current = false;
        clearTimers();
        setView((v) => (v ? { ...v, visible: false } : v));
        slideTimer.current = setTimeout(() => {
            slideTimer.current = undefined;
            current.current = null;
            setView(null);
            advanceRef.current();
        }, SLIDE_MS);
    }, [clearTimers]);

    // runs the auto-hide timer with the remaining time, unless paused
    const startAutoTimer = useCallback(() => {
        clearTimeout(autoTimer.current);
        autoTimer.current = undefined;
        if (!shown.current || hovered.current || focused.current) return;
        if (!Number.isFinite(remaining.current)) return;
        startedAt.current = Date.now();
        autoTimer.current = setTimeout(() => {
            autoTimer.current = undefined;
            hideCurrent();
        }, remaining.current);
    }, [hideCurrent]);

    const pauseAutoTimer = useCallback(() => {
        if (autoTimer.current === undefined) return;
        clearTimeout(autoTimer.current);
        autoTimer.current = undefined;
        remaining.current = Math.max(
            0,
            remaining.current - (Date.now() - startedAt.current)
        );
    }, []);

    // makes the next queued banner current and slides it in
    const advance = useCallback(() => {
        const next = queue.current.shift();
        hiding.current = false;
        shown.current = false;
        hovered.current = false;
        focused.current = false;
        if (!next) return;
        current.current = next;
        remaining.current = next.durationMs ?? DEFAULT_DURATION_MS;
        setView({ banner: next, visible: false });
        enterTimer.current = setTimeout(() => {
            setView((v) => (v ? { ...v, visible: true } : v));
            enterTimer.current = setTimeout(() => {
                enterTimer.current = undefined;
                shown.current = true;
                startAutoTimer();
            }, SLIDE_MS);
        }, ENTER_DELAY_MS);
    }, [startAutoTimer]);

    useEffect(() => {
        advanceRef.current = advance;
    }, [advance]);

    const show = useCallback(
        (options: BannerOptions): string => {
            const { key } = options;
            if (key !== undefined) {
                const cur = current.current;
                if (cur && !hiding.current && cur.key === key) {
                    const updated = { ...options, id: cur.id };
                    current.current = updated;
                    setView((v) => (v ? { ...v, banner: updated } : v));
                    remaining.current =
                        options.durationMs ?? DEFAULT_DURATION_MS;
                    startAutoTimer();
                    return cur.id;
                }
                const index = queue.current.findIndex((b) => b.key === key);
                if (index !== -1) {
                    const updated = {
                        ...options,
                        id: queue.current[index].id
                    };
                    queue.current[index] = updated;
                    return updated.id;
                }
            }
            const banner = { ...options, id: `banner-${nextId.current++}` };
            queue.current.push(banner);
            if (!current.current) advance();
            return banner.id;
        },
        [advance, startAutoTimer]
    );

    const hide = useCallback(
        (id: string) => {
            if (current.current?.id === id) {
                hideCurrent();
                return;
            }
            queue.current = queue.current.filter((b) => b.id !== id);
        },
        [hideCurrent]
    );

    useEffect(() => clearTimers, [clearTimers]);

    const api = useMemo(() => ({ hide, show }), [hide, show]);

    const setPaused = (source: 'hover' | 'focus', on: boolean): void => {
        if (source === 'hover') hovered.current = on;
        else focused.current = on;
        if (on) pauseAutoTimer();
        else startAutoTimer();
    };

    return (
        <BannerContext.Provider value={api}>
            {children}
            {view && (
                <Banner
                    actions={view.banner.actions}
                    kind={view.banner.kind}
                    message={view.banner.message}
                    onBlur={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget)) {
                            setPaused('focus', false);
                        }
                    }}
                    onClose={() => hide(view.banner.id)}
                    onFocus={() => setPaused('focus', true)}
                    onPointerEnter={() => setPaused('hover', true)}
                    onPointerLeave={() => setPaused('hover', false)}
                    severity={view.banner.severity}
                    visible={view.visible}
                />
            )}
        </BannerContext.Provider>
    );
};
