import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiAvatar } from '@/components/ai-avatar';
import { Button, Icon, icons, minTouch } from '@/components/ui';
import { useChat, useChatAccess, type ChatMessage } from '@/lib/chat';
import type { Person } from '@/lib/data';
import { formatDate, formatTime } from '@/lib/format';
import { useKeyboardInset } from '@/lib/keyboard';
import { portraitAt } from '@/lib/portrait';
import { color, desktopBreakpoint, font, radius, space, type } from '@/theme';

// Chat with a person's AI simulation (batch K; owner, Nov 2, 2026). The profile card ends in what looks like a
// message field; it is only a button. Tapping it grows the card into a chat panel over the planet with the keyboard up.

type Rect = { x: number; y: number; width: number; height: number };
const web = Platform.OS === 'web';
const first = (p: Person) => p.name.split(/\s+/)[0];

/** Focus without letting the browser scroll anything to reveal the field (it would scroll the clipped panel itself). */
function focusStill(field: ComponentRef<typeof TextInput> | null) {
  if (!field) return;
  if (web && typeof HTMLElement !== 'undefined' && field instanceof HTMLElement) HTMLElement.prototype.focus.call(field, { preventScroll: true });
  else field.focus();
}

/** The card's facade: a message field and a send button that both open the chat. */
export function ChatEntry({ person, measureCard }: { person: Person; measureCard: (done: (r: Rect | null) => void) => void }) {
  const access = useChatAccess();
  const [open, setOpen] = useState<{ from: Rect | null } | null>(null);
  // iOS Safari only raises the keyboard for a focus() inside the tap itself, and the chat's field isn't mounted yet:
  // focus this invisible field now, then hand focus to the real one (the keyboard stays up across the hand-off).
  const proxy = useRef<ComponentRef<typeof TextInput>>(null);

  const show = () => {
    if (web && access === 'ready') focusStill(proxy.current);
    measureCard((from) => setOpen({ from }));
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Message ${person.name}, AI simulation`}
        accessibilityHint="Opens a chat with an AI simulation built from their public words"
        onPress={show}
        style={({ pressed }) => [styles.entry, pressed && { opacity: 0.8 }]}>
        <View style={styles.entryField}>
          <Icon name={icons.sparkle} size={15} tint={color.textSecondary} />
          <Text style={styles.entryText} numberOfLines={1}>
            Message {first(person)}…
          </Text>
        </View>
        <View style={styles.sendButton}>
          <Icon name={icons.send} size={20} tint={color.onAction} />
        </View>
      </Pressable>
      {web && <TextInput ref={proxy} style={styles.proxy} accessible={false} tabIndex={-1} aria-hidden />}
      {open && <ChatSheet person={person} from={open.from} access={access} onClose={() => setOpen(null)} />}
    </>
  );
}

function ChatSheet({
  person,
  from,
  access,
  onClose,
}: {
  person: Person;
  from: Rect | null;
  access: ReturnType<typeof useChatAccess>;
  onClose: () => void;
}) {
  const { width: vw, height: vh } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const desktop = vw >= desktopBreakpoint;
  const keyboard = useKeyboardInset(true);
  const t = useRef(new Animated.Value(0)).current;
  const [reduce, setReduce] = useState(false);
  const [settled, setSettled] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const ready = access === 'ready';

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce, () => {});
  }, []);
  useEffect(() => {
    // Native: focus once the panel has grown. Web: the keyboard is already up on the proxy, so hand over right away.
    if (ready && web) focusStill(input.current);
    Animated.timing(t, { toValue: 1, duration: reduce ? 160 : 420, easing: Easing.out(Easing.exp), useNativeDriver: false }).start(() => {
      setSettled(true);
      if (ready && !web) input.current?.focus();
    });
  }, [reduce, ready, t]);
  const close = () => {
    input.current?.blur();
    setSettled(false);
    Animated.timing(t, { toValue: 0, duration: reduce ? 120 : 260, easing: Easing.in(Easing.cubic), useNativeDriver: false }).start(onClose);
  };

  // Phones: most of the screen, above the keyboard. Desktop: a tall centred panel.
  const gap = space.sm;
  const width = desktop ? Math.min(640, vw - space.xl * 2) : vw - gap * 2;
  const top = desktop ? Math.max(space.xl, (vh - Math.min(820, vh - space.xl * 2)) / 2) : insets.top + gap;
  const bottom = desktop ? top : Math.max(keyboard, insets.bottom) + gap;
  const target = { x: (vw - width) / 2, y: top, width, height: Math.max(240, vh - top - bottom) };
  // Reduced motion (or no card to grow from): a fade in place.
  const start = !reduce && from ? from : target;
  const lerp = (a: number, b: number) => (settled ? b : t.interpolate({ inputRange: [0, 1], outputRange: [a, b] }));

  return (
    <Modal transparent visible animationType="none" onRequestClose={close}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: t }]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close chat" onPress={close} />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        aria-modal
        role="dialog"
        aria-label={`Chat with ${person.name}, AI simulation`}
        style={[
          styles.sheet,
          {
            left: lerp(start.x, target.x),
            top: lerp(start.y, target.y),
            width: lerp(start.width, target.width),
            height: lerp(start.height, target.height),
            opacity: reduce || !from ? t : 1,
          },
        ]}>
        {/* The card's own colour field, carried into the chat: the blurred portrait under a firmer frost. */}
        {person.portrait_url && (
          <Image source={portraitAt(person.portrait_url, 120)} style={styles.bg} contentFit="cover" blurRadius={60} accessible={false} />
        )}
        <View style={[StyleSheet.absoluteFill, styles.frost]} />
        {/* Laid out at the panel's final size so nothing reflows while it grows; it fades in as the card opens. */}
        <Animated.View
          style={[
            styles.content,
            { width: target.width, height: target.height, opacity: reduce || !from ? 1 : t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.2, 1] }) },
          ]}>
          <Header person={person} onClose={close} />
          {access === 'loading' ? (
            <View style={styles.centre}>
              <ActivityIndicator color={color.textSecondary} />
            </View>
          ) : ready ? (
            <Thread person={person} input={input} />
          ) : (
            <Gate person={person} unverified={access === 'unverified'} onGo={() => (close(), router.push('/account'))} />
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function Header({ person, onClose }: { person: Person; onClose: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close chat" onPress={onClose} hitSlop={4} style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}>
        <Icon name={icons.close} size={20} tint={color.text} />
      </Pressable>
      <AiAvatar uri={person.portrait_url} name={person.name} size={40} />
      <View style={styles.headerText}>
        <View style={styles.nameRow}>
          <Text accessibilityRole="header" style={[type.headline, { color: color.text, flexShrink: 1 }]} numberOfLines={1}>
            {person.name}
          </Text>
          <View accessible accessibilityLabel="AI simulation" role="img">
            <Icon name={icons.sparkle} size={15} tint={color.action} />
          </View>
        </View>
        <Text style={styles.headerSub} numberOfLines={1}>
          AI simulation
        </Text>
      </View>
    </View>
  );
}

function Gate({ person, unverified, onGo }: { person: Person; unverified: boolean; onGo: () => void }) {
  return (
    <View style={styles.centre}>
      <Text style={[type.headline, styles.centreText]}>{unverified ? 'Verify this device to chat.' : `Sign in to message ${first(person)}.`}</Text>
      <Text style={[type.body, styles.centreText, { color: color.textSecondary }]}>
        {unverified
          ? 'Chats are private to your account, so they open only on a device you’ve confirmed with an emailed code.'
          : 'Chats are private to your account. Up to 20 messages a day.'}
      </Text>
      <View>
        <Button label={unverified ? 'Verify device' : 'Sign in'} onPress={onGo} />
      </View>
    </View>
  );
}

function Thread({ person, input }: { person: Person; input: React.RefObject<ComponentRef<typeof TextInput> | null> }) {
  const chat = useChat(person.id, person.slug, true);
  const [draft, setDraft] = useState('');
  const typing = chat.typing;
  const paused = chat.pausedUntil && new Date(chat.pausedUntil).getTime() > Date.now() ? chat.pausedUntil : null;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const send = async (text = draft) => {
    if (!text.trim() || chat.sending || paused) return;
    setDraft('');
    const ok = await chat.send(text);
    if (!ok) setDraft((d) => d || text);
  };

  const starters = [
    'What are you working on right now?',
    person.main_source ? `How did ${person.main_source} get started?` : 'How did you get started?',
    'What would you tell someone starting out?',
  ];

  return (
    <>
      <Text style={styles.note}>
        An AI simulation built from {first(person)}’s public words and recent news. It isn’t {first(person)}, and it can be wrong.
      </Text>
      <ScrollView
        ref={scroll}
        style={styles.flex}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        {chat.loading ? (
          <ActivityIndicator color={color.textSecondary} style={{ marginTop: space.lg }} />
        ) : chat.loadError ? (
          <Text style={[styles.inline, { color: color.loss }]}>Couldn’t load this chat. Close it and try again.</Text>
        ) : chat.messages.length === 0 && !chat.sending ? (
          <View style={styles.starters}>
            <Text style={[styles.inline, { marginBottom: space.xs }]}>Start with a question.</Text>
            {starters.map((s) => (
              <Pressable key={s} accessibilityRole="button" onPress={() => void send(s)} style={({ pressed }) => [styles.starter, pressed && { opacity: 0.7 }]}>
                <Text style={[type.body, { color: color.action }]}>{s}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          chat.messages.map((m, i) =>
            m.role === 'notice' ? (
              <Notice key={m.id} text={m.text} />
            ) : (
            <Bubble
              key={m.id}
              m={m}
              name={first(person)}
              dayBreak={i === 0 || day(chat.messages[i - 1].created_at) !== day(m.created_at)}
              seen={!!m.seen_at || (typing && i === chat.messages.length - 1)}
              avatar={chat.messages[i - 1]?.role !== 'assistant' ? person : null}
            />
            ),
          )
        )}
        {typing && <Typing name={first(person)} person={person} />}
        {chat.error && !paused && <Text style={[styles.inline, !chat.error.limit && { color: color.loss }]}>{chat.error.text}</Text>}
      </ScrollView>
      {paused ? (
        <View style={styles.composer} accessibilityLiveRegion="polite" aria-live="polite">
          <Text style={[styles.inline, { flex: 1 }]}>
            Chat is paused until {formatDate(paused)}, {formatTime(paused)} after repeated rule breaks. If it keeps happening, the account may be banned.
          </Text>
        </View>
      ) : (
      <View style={styles.composer}>
        <TextInput
          ref={input}
          value={draft}
          onChangeText={setDraft}
          placeholder={`Message ${first(person)}…`}
          placeholderTextColor={color.textSecondary}
          accessibilityLabel={`Message ${person.name}`}
          multiline
          numberOfLines={web ? 1 : undefined}
          maxLength={2000}
          enterKeyHint="send"
          submitBehavior="submit"
          onSubmitEditing={() => void send()}
          onKeyPress={(e) => {
            // Web: Enter sends, Shift+Enter is a new line.
            const k = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
            if (web && k.key === 'Enter' && !k.shiftKey) {
              (e as unknown as { preventDefault: () => void }).preventDefault();
              void send();
            }
          }}
          style={styles.field}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !draft.trim() || chat.sending }}
          disabled={!draft.trim() || chat.sending}
          onPress={() => void send()}
          style={({ pressed }) => [styles.sendButton, (!draft.trim() || chat.sending) && styles.disabled, pressed && { opacity: 0.7 }]}>
          <Icon name={icons.send} size={20} tint={color.onAction} />
        </Pressable>
      </View>
      )}
    </>
  );
}

const day = (iso: string) => iso.slice(0, 10);

function Bubble({ m, name, dayBreak, seen, avatar }: { m: ChatMessage; name: string; dayBreak: boolean; seen: boolean; avatar: Person | null }) {
  const mine = m.role === 'user';
  const status = mine ? (m.pending && !seen ? 'Sending' : seen ? 'Seen' : 'Sent') : null;
  return (
    <>
      {dayBreak && <Text style={styles.day}>{formatDate(m.created_at)}</Text>}
      <Theirs person={mine ? undefined : avatar}>
        <View style={[styles.bubbleWrap, mine ? styles.right : styles.left]}>
        <View
          accessible
          accessibilityLabel={`${mine ? 'You' : `${name}, AI simulation`}: ${m.text}. ${formatTime(m.created_at)}${status ? `, ${status}` : ''}${m.reaction ? `. ${name} reacted ${REACTION_NAMES[m.reaction] ?? m.reaction}` : ''}`}
          style={[styles.bubble, mine ? styles.mine : styles.theirs, !!m.reaction && styles.reacted]}>
          <Text selectable style={[type.body, { color: mine ? color.onAction : color.text }]}>
            {m.text}
          </Text>
          {!!m.reaction && <Reaction emoji={m.reaction} />}
        </View>
        <View style={[styles.meta, mine && { justifyContent: 'flex-end' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {!mine && <Icon name={icons.sparkle} size={11} tint={color.textSecondary} />}
          <Text style={styles.metaText}>{formatTime(m.created_at)}</Text>
          {mine && <Ticks seen={seen} pending={!!m.pending && !seen} />}
        </View>
        {!!m.sources?.length && (
          <View style={styles.sources}>
            {m.sources.slice(0, 3).map((s) => (
              <Pressable
                key={s.url}
                accessibilityRole="link"
                accessibilityLabel={`Source: ${s.title}`}
                accessibilityHint="Opens the article"
                onPress={() => void WebBrowser.openBrowserAsync(s.url)}
                style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}>
                <Icon name={icons.link} size={11} tint={color.textSecondary} />
                <Text style={styles.chipText} numberOfLines={1}>
                  {s.title}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        </View>
      </Theirs>
    </>
  );
}

const AVATAR = 28;

const REACTION_NAMES: Record<string, string> = { '👍': 'thumbs up', '❤️': 'heart', '😂': 'laughing', '😮': 'surprised', '🤔': 'thinking', '😕': 'confused' };

/** Their tapback, pinned to the top-left corner of your bubble; it pops in once (reduced motion: appears). */
function Reaction({ emoji }: { emoji: string }) {
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((still) => {
      if (!alive) return;
      if (still) pop.setValue(1);
      else Animated.spring(pop, { toValue: 1, friction: 5, tension: 160, useNativeDriver: !web }).start();
    });
    return () => {
      alive = false;
    };
  }, [pop]);
  return (
    <Animated.View style={[styles.reaction, { transform: [{ scale: pop }] }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={styles.reactionText}>{emoji}</Text>
    </Animated.View>
  );
}

/** A chat-rules warning: centred in the thread, announced once. */
function Notice({ text }: { text: string }) {
  return (
    <View style={styles.notice} accessibilityRole="alert" accessibilityLiveRegion="assertive" aria-live="assertive">
      <Icon name={icons.warning} size={14} tint={color.loss} />
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

/** Their side of the thread: the stylised AI avatar beside the first bubble of each run, a same-width gap beside the rest. */
function Theirs({ person, children }: { person: Person | null | undefined; children: ReactNode }) {
  if (person === undefined) return <>{children}</>;
  return (
    <View style={styles.theirsRow}>
      {person ? <AiAvatar uri={person.portrait_url} name={person.name} size={AVATAR} /> : <View style={{ width: AVATAR }} />}
      {children}
    </View>
  );
}

/** One tick when sent, two once "seen" (the reply has started). Drawn icons, not text glyphs. */
function Ticks({ seen, pending }: { seen: boolean; pending: boolean }) {
  if (pending) return <ActivityIndicator size={10} color={color.textSecondary} />;
  const tint = seen ? color.action : color.textSecondary;
  if (!seen) return <Icon name={icons.check} size={13} tint={tint} />;
  if (Platform.OS !== 'ios') return <Icon name={icons.seen} size={13} tint={tint} />;
  return (
    <View style={{ flexDirection: 'row' }}>
      <Icon name={icons.check} size={13} tint={tint} />
      <View style={{ marginLeft: -7 }}>
        <Icon name={icons.check} size={13} tint={tint} />
      </View>
    </View>
  );
}

function Typing({ name, person }: { name: string; person: Person }) {
  const [reduce, setReduce] = useState(false);
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0.35))).current;
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce, () => {});
  }, []);
  useEffect(() => {
    if (reduce) return;
    const pulse = (v: Animated.Value) =>
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(v, { toValue: 0.35, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: false }),
      ]);
    const loop = Animated.loop(Animated.stagger(160, dots.map(pulse)));
    loop.start();
    return () => loop.stop();
  }, [dots, reduce]);
  return (
    <Theirs person={person}>
    <View style={[styles.bubbleWrap, styles.left]} accessibilityLiveRegion="polite" aria-live="polite" accessibilityLabel={`${name} is typing`}>
      <View style={[styles.bubble, styles.theirs, styles.typing]}>
        {reduce ? (
          <Text style={[type.body, { color: color.textSecondary }]}>typing…</Text>
        ) : (
          dots.map((v, i) => <Animated.View key={i} style={[styles.dot, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0.35, 1], outputRange: [0.85, 1.1] }) }] }]} />)
        )}
      </View>
    </View>
    </Theirs>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  entryField: {
    flex: 1,
    minHeight: minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
  },
  entryText: { ...type.body, color: color.textSecondary, flexShrink: 1 },
  sendButton: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: color.action },
  disabled: { opacity: 0.4 },
  // Focusable but invisible and out of the way (not display:none, which iOS won't focus).
  proxy: { position: 'absolute', width: 1, height: 1, opacity: 0, left: 0, bottom: 0, fontSize: 16 },
  backdrop: { backgroundColor: 'rgba(4,6,11,0.55)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' } as object,
  sheet: {
    position: 'absolute',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: 'rgba(16,18,26,0.92)',
    boxShadow: '0 24px 64px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25), inset 1.5px 1.5px 1px -0.5px rgba(255,255,255,0.3)',
  } as object,
  bg: { position: 'absolute', top: '-25%', left: '-25%', width: '150%', height: '150%' },
  frost: { backgroundColor: 'rgba(12,14,20,0.80)' },
  content: { position: 'absolute', left: 0, top: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  close: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerSub: { ...type.caption, color: color.textSecondary },
  note: { ...type.caption, color: color.textSecondary, textAlign: 'center', paddingHorizontal: space.lg, paddingTop: space.sm },
  messages: { padding: space.md, gap: space.sm, flexGrow: 1, justifyContent: 'flex-end' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg },
  centreText: { color: color.text, textAlign: 'center', maxWidth: 380 },
  inline: { ...type.caption, color: color.textSecondary, textAlign: 'center', paddingVertical: space.xs },
  starters: { gap: space.sm, alignItems: 'flex-end' },
  starter: {
    minHeight: minTouch,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(108,184,255,0.45)',
    maxWidth: '85%',
  },
  day: { ...type.caption, color: color.textSecondary, textAlign: 'center', marginVertical: space.xs },
  bubbleWrap: { maxWidth: '82%', gap: 3 },
  left: { alignSelf: 'flex-start' },
  theirsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, alignSelf: 'flex-start', maxWidth: '90%' },
  right: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  mine: { backgroundColor: color.action, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: 'rgba(255,255,255,0.11)', borderTopLeftRadius: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  metaText: { fontFamily: font.medium, fontSize: 11, color: color.textSecondary, fontVariant: ['tabular-nums'] },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 220,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
  },
  chipText: { fontFamily: font.medium, fontSize: 12, color: color.textSecondary, flexShrink: 1 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 40 },
  reacted: { marginTop: 12 },
  reaction: {
    position: 'absolute',
    top: -14,
    left: -10,
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(40,44,58,0.96)',
    borderWidth: 1.5,
    borderColor: 'rgba(16,18,26,0.92)',
  },
  reactionText: { fontSize: 15, lineHeight: 18 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    alignSelf: 'center',
    maxWidth: '92%',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(180,35,24,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,120,110,0.35)',
  },
  noticeText: { ...type.caption, color: color.text, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.text },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    padding: space.sm,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  field: {
    ...type.body,
    flex: 1,
    minHeight: minTouch,
    maxHeight: 132,
    paddingHorizontal: space.md,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: 22,
    color: color.text,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    // iOS zooms into fields under 16px; keep 16.
    fontSize: 16,
    resize: 'none',
  } as object,
});
