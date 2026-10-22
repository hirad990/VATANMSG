import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, I18nManager, Image, KeyboardAvoidingView, LayoutAnimation, Modal, Platform, Pressable, UIManager, ScrollView, StatusBar, StyleSheet, Switch, Text as NativeText, TextInput, View, Keyboard } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Vazirmatn_400Regular, Vazirmatn_500Medium, Vazirmatn_600SemiBold, Vazirmatn_700Bold, Vazirmatn_800ExtraBold, Vazirmatn_900Black } from '@expo-google-fonts/vazirmatn';
import { addConversationMember, createChannel, createDirectConversation, createGroup, deleteConversation, deleteMessage, editMessage, getConversationMembers, getConversationSettings, getMessages, getMyProfile, leaveConversation, listConversations, searchConversationMessages, loginWithPassword, logout as logoutFromApi, markMessagesRead, registerAccount, removeConversationMember, registerPushDevice, searchUsers, sendMessage, setConversationMemberRole, toggleMessageReaction, transferConversationOwnership, logoutAllSessions, uploadConversationAttachment, updateConversationSettings, updateMyProfile, uploadProfilePhoto, getUserProfile, type VatanGroupSettings, type VatanMember, type VatanMessage, type VatanUser } from './src/services/api';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';


if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

async function registerPushForSession(token: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return; // Configure the EAS project ID in app.json to activate push delivery.
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return;
    const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await registerPushDevice(token, pushToken, Platform.OS === 'ios' ? 'ios' : 'android');
  } catch {
    // Push setup must not block login if permissions or push services are unavailable.
  }
}

const SESSION_KEY = 'vatanmsg.session.v1';
const ROOM_PREFS_KEY = 'vatanmsg.roomprefs.v1';
const DRAFTS_KEY = 'vatanmsg.drafts.v1';
const SAVED_MESSAGES_KEY = 'vatanmsg.savedmessages.v1';
const APP_PREFS_KEY = 'vatanmsg.appprefs.v1';

async function readSavedSession(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(SESSION_KEY); }
    catch { return null; }
  }
  return SecureStore.getItemAsync(SESSION_KEY);
}

async function saveSession(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SESSION_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
}

async function clearSavedSession(): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(SESSION_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

function Text(props: React.ComponentProps<typeof NativeText>) {
  const flattened = StyleSheet.flatten(props.style);
  const weight = flattened?.fontWeight;
  const fontFamily = weight === '900' ? 'Vazirmatn_900Black'
    : weight === '800' ? 'Vazirmatn_800ExtraBold'
    : weight === '700' || weight === 'bold' ? 'Vazirmatn_700Bold'
    : weight === '600' ? 'Vazirmatn_600SemiBold'
    : weight === '500' ? 'Vazirmatn_500Medium'
    : 'Vazirmatn_400Regular';
  return <NativeText {...props} style={[{ fontFamily }, props.style]} />;
}

type Language = 'fa' | 'en';
type ThemeMode = 'light' | 'dark';
type AccentPreset = 'violet' | 'blue' | 'cyan' | 'rose' | 'green' | 'amber';
type Tab = 'chats' | 'contacts' | 'groups' | 'channels' | 'saved' | 'settings';
type SavedMessage = VatanMessage & { savedAt: string };
type Room = { id: string; title: string; subtitle: string; icon: string; kind: 'group' | 'channel' | 'direct'; role?: 'owner' | 'admin' | 'member' | 'subscriber'; avatarUrl?: string | null };

const COPY = {
  fa: {
    brand: 'وطن', tagline: 'ارتباط، نزدیک‌تر از همیشه', search: 'جست‌وجوی پیام‌ها و افراد',
    chats: 'گفت‌وگوها', contacts: 'مخاطبین', groups: 'گروه‌ها', channels: 'کانال‌ها', savedTab: 'پیام‌های ذخیره‌شده', settings: 'تنظیمات',
    welcome: 'سلام، خوش اومدی 👋', overview: 'همه ارتباطاتت، یک‌جا',
    recent: 'گفت‌وگوهای اخیر', seeAll: 'مشاهده همه', online: 'آنلاین', today: 'امروز',
    emptyTitle: 'اینجا هنوز خبری نیست', emptyBody: 'با ساختن یک گروه یا کانال، شروع کن.',
    createGroup: 'ساخت گروه', createChannel: 'ساخت کانال', newGroup: 'گروه جدید', newChannel: 'کانال جدید',
    name: 'نام', description: 'توضیحات (اختیاری)', create: 'ایجاد', cancel: 'انصراف',
    profile: 'پروفایل من', editProfile: 'ویرایش پروفایل', displayName: 'نام نمایشی', username: 'نام کاربری',
    birthday: 'سال تولد', calendar: 'تقویم تولد', solar: 'شمسی', gregorian: 'میلادی',
    appearance: 'ظاهر برنامه', dark: 'حالت تاریک', language: 'زبان برنامه', fa: 'فارسی', en: 'English',
    account: 'حساب کاربری', privacy: 'حریم خصوصی', notifications: 'اعلان‌ها', about: 'درباره وطن',
    save: 'ذخیره تغییرات', saved: 'تغییرات ذخیره شد', choosePhoto: 'انتخاب عکس پروفایل',
    noContacts: 'هنوز کاربری پیدا نشده؛ با نام کاربری جست‌وجو کن.', demo: 'حساب کاربری', phone: 'ورود / ثبت‌نام',
    phoneHint: 'نام کاربری', continue: 'ادامه', backend: 'حساب خودت را بساز یا با رمز عبور وارد شو.',
    members: 'عضو', subscribers: 'دنبال‌کننده', newMessage: 'پیام جدید', profileHint: 'خودت را به دیگران معرفی کن',
    home: 'خانه', all: 'همه', privateNote: 'برای ذخیره پروفایل باید به API وارد شده باشی.'
  },
  en: {
    brand: 'Vatan', tagline: 'Closer, wherever you are', search: 'Search messages and people',
    chats: 'Chats', contacts: 'Contacts', groups: 'Groups', channels: 'Channels', savedTab: 'Saved messages', settings: 'Settings',
    welcome: 'Hello, welcome back 👋', overview: 'All your conversations, in one place',
    recent: 'Recent chats', seeAll: 'See all', online: 'Online', today: 'Today',
    emptyTitle: 'It’s quiet here for now', emptyBody: 'Start by creating a group or channel.',
    createGroup: 'Create group', createChannel: 'Create channel', newGroup: 'New group', newChannel: 'New channel',
    name: 'Name', description: 'Description (optional)', create: 'Create', cancel: 'Cancel',
    profile: 'My profile', editProfile: 'Edit profile', displayName: 'Display name', username: 'Username',
    birthday: 'Birth year', calendar: 'Birth calendar', solar: 'Solar Hijri', gregorian: 'Gregorian',
    appearance: 'Appearance', dark: 'Dark mode', language: 'App language', fa: 'فارسی', en: 'English',
    account: 'Account', privacy: 'Privacy', notifications: 'Notifications', about: 'About Vatan',
    save: 'Save changes', saved: 'Changes saved', choosePhoto: 'Choose profile photo',
    noContacts: 'No users found yet. Search by username.', demo: 'ACCOUNT', phone: 'Sign in / Sign up',
    phoneHint: 'Username', continue: 'Continue', backend: 'Create an account or sign in with your password.',
    members: 'members', subscribers: 'subscribers', newMessage: 'New message', profileHint: 'Let people know you',
    home: 'Home', all: 'All', privateNote: 'Sign in to the API to save profile changes.'
  }
};

function AppContent() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ Vazirmatn_400Regular, Vazirmatn_500Medium, Vazirmatn_600SemiBold, Vazirmatn_700Bold, Vazirmatn_800ExtraBold, Vazirmatn_900Black });
  const heroMotion = useRef(new Animated.Value(0)).current;
  const tabMotion = useRef(new Animated.Value(1)).current;
  const chatTransition = useRef(new Animated.Value(0)).current;
  const composerLift = useRef(new Animated.Value(0)).current;
  const voiceSoundRef = useRef<Audio.Sound | null>(null);
  const roomPressScales = useRef<Record<string, Animated.Value>>({}).current;
  const [lang, setLang] = useState<Language>('fa');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [accentPreset, setAccentPreset] = useState<AccentPreset>('violet');
  const [compactMessages, setCompactMessages] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [telegramUrl, setTelegramUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<VatanUser | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('chats');
  const [displayName, setDisplayName] = useState('هیراد');
  const [username, setUsername] = useState('hirad');
  const [birthYear, setBirthYear] = useState('');
  const [calendar, setCalendar] = useState<'solar' | 'gregorian'>('solar');
  const [photo, setPhoto] = useState<string | null>(null);
  const [modal, setModal] = useState<'group' | 'channel' | 'profile' | 'login' | 'chat' | 'groupSettings' | 'searchMessages' | 'forward' | 'userProfile' | null>(null);
  const [roomName, setRoomName] = useState('');
  const [roomDescription, setRoomDescription] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [search, setSearch] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginDisplayName, setLoginDisplayName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginMode, setLoginMode] = useState<'login' | 'register'>('register');
  const [contactsQuery, setContactsQuery] = useState('');
  const [foundUsers, setFoundUsers] = useState<VatanUser[]>([]);
  const [memberUsername, setMemberUsername] = useState('');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [messageSearchResults, setMessageSearchResults] = useState<VatanMessage[]>([]);
  const [groupMembers, setGroupMembers] = useState<VatanMember[]>([]);
  const [groupSettings, setGroupSettings] = useState<VatanGroupSettings | null>(null);
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<VatanMessage[]>([]);
  const [imageViewerUri, setImageViewerUri] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<VatanMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [messageReactions, setMessageReactions] = useState<Record<string, { reaction: string; count: number }[]>>({});
  const [busy, setBusy] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState<Audio.Recording | null>(null);
  const [saved, setSaved] = useState(false);
  const [chatFilter, setChatFilter] = useState<'all' | 'direct' | 'group' | 'channel' | 'pinned'>('all');
  const [pinnedRoomIds, setPinnedRoomIds] = useState<string[]>([]);
  const [roomPrefsReady, setRoomPrefsReady] = useState(false);
  const [draftsByRoom, setDraftsByRoom] = useState<Record<string, string>>({});
  const [savedMessages, setSavedMessages] = useState<SavedMessage[]>([]);
  const [savedDataReady, setSavedDataReady] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [appPrefsReady, setAppPrefsReady] = useState(false);

  const t = COPY[lang];
  const tapFeedback = () => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => undefined);
  };
  const toggleNotifications = async (enabled: boolean) => {
    if (!enabled) {
      setNotificationsEnabled(false);
      return;
    }
    if (Platform.OS === 'web') {
      showAlert(lang === 'fa' ? 'اعلان‌های این نسخه به پشتیبانی مرورگر نیاز دارند؛ در نسخه اندروید از مجوز سیستم استفاده می‌شود.' : 'Browser notifications require browser support. The Android app uses system notification permission.');
      return;
    }
    try {
      let permission = await Notifications.getPermissionsAsync();
      if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
      setNotificationsEnabled(permission.granted);
      if (!permission.granted) showAlert(lang === 'fa' ? 'مجوز اعلان از تنظیمات اندروید قابل فعال‌سازی است.' : 'Enable notification permission in Android settings.');
      else if (!(Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId)) {
        showAlert(lang === 'fa' ? 'مجوز دستگاه فعال شد؛ برای دریافت پیام هنگام بسته بودن برنامه، تنظیم ارسال Push روی سرور هم باید پیکربندی شود.' : 'Device permission is enabled. Server push delivery must also be configured for notifications while the app is closed.');
      }
    } catch {
      showAlert(lang === 'fa' ? 'بررسی مجوز اعلان ممکن نشد.' : 'Could not check notification permission.');
    }
  };
  const dark = theme === 'dark';
  const accent = ({ violet: '#8B7CFF', blue: '#3D7EFF', cyan: '#00B8D9', rose: '#F06B9A', green: '#27B98A', amber: '#E6A23C' } as Record<AccentPreset, string>)[accentPreset];
  const c = dark ? {
    bg: '#080D1A', surface: '#10182A', card: '#151F35', text: '#F5F7FF', muted: '#9AA8C2',
    border: '#26334E', primary: accent, soft: accent + '2E', input: '#0C1425'
  } : {
    bg: '#F4F5FC', surface: '#FFFFFF', card: '#FFFFFF', text: '#171A32', muted: '#747D96',
    border: '#E5E7F2', primary: accent, soft: accent + '20', input: '#F7F7FC'
  };
  const isRTL = lang === 'fa';

  useEffect(() => {
    let cancelled = false;
    const restoreAppPreferences = async () => {
      try {
        const raw = await AsyncStorage.getItem(APP_PREFS_KEY);
        if (!cancelled && raw) {
          const parsed: unknown = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            const prefs = parsed as { theme?: unknown; lang?: unknown; notificationsEnabled?: unknown; accentPreset?: unknown; compactMessages?: unknown; motionEnabled?: unknown };
            if (prefs.theme === 'light' || prefs.theme === 'dark') setTheme(prefs.theme);
            if (prefs.lang === 'fa' || prefs.lang === 'en') setLang(prefs.lang);
            if (typeof prefs.notificationsEnabled === 'boolean') setNotificationsEnabled(prefs.notificationsEnabled);
            if (['violet','blue','cyan','rose','green','amber'].includes(String(prefs.accentPreset))) setAccentPreset(prefs.accentPreset as AccentPreset);
            if (typeof prefs.compactMessages === 'boolean') setCompactMessages(prefs.compactMessages);
            if (typeof prefs.motionEnabled === 'boolean') setMotionEnabled(prefs.motionEnabled);
          }
        }
      } catch { /* Keep defaults when preferences are unavailable. */ }
      finally { if (!cancelled) setAppPrefsReady(true); }
    };
    void restoreAppPreferences();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!appPrefsReady) return;
    void AsyncStorage.setItem(APP_PREFS_KEY, JSON.stringify({ theme, lang, notificationsEnabled, accentPreset, compactMessages, motionEnabled })).catch(() => undefined);
  }, [theme, lang, notificationsEnabled, accentPreset, compactMessages, motionEnabled, appPrefsReady]);

  useEffect(() => {
    let cancelled = false;
    const restoreRoomPreferences = async () => {
      try {
        const raw = await AsyncStorage.getItem(ROOM_PREFS_KEY);
        if (!cancelled && raw) {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) setPinnedRoomIds(parsed.filter((id): id is string => typeof id === 'string'));
        }
      } catch { /* Preferences are optional; never block opening chats. */ }
      finally { if (!cancelled) setRoomPrefsReady(true); }
    };
    void restoreRoomPreferences();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!roomPrefsReady) return;
    const persistRoomPreferences = async () => {
      try {
        const value = JSON.stringify(pinnedRoomIds);
        if (Platform.OS === 'web') {
          if (typeof localStorage !== 'undefined') localStorage.setItem(ROOM_PREFS_KEY, value);
        } else {
          await SecureStore.setItemAsync(ROOM_PREFS_KEY, value);
        }
      } catch { /* A storage failure must not affect messaging. */ }
    };
    void persistRoomPreferences();
  }, [pinnedRoomIds, roomPrefsReady]);

  useEffect(() => {
    let cancelled = false;
    const restoreLocalMessengerData = async () => {
      try {
        const [draftRaw, savedRaw] = await Promise.all([AsyncStorage.getItem(DRAFTS_KEY), AsyncStorage.getItem(SAVED_MESSAGES_KEY)]);
        if (cancelled) return;
        if (draftRaw) { const value: unknown = JSON.parse(draftRaw); if (value && typeof value === 'object' && !Array.isArray(value)) setDraftsByRoom(value as Record<string, string>); }
        if (savedRaw) { const value: unknown = JSON.parse(savedRaw); if (Array.isArray(value)) setSavedMessages(value as SavedMessage[]); }
      } catch { /* Local enhancements must never block the messenger. */ }
      finally { if (!cancelled) setSavedDataReady(true); }
    };
    void restoreLocalMessengerData();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!savedDataReady) return;
    void AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(draftsByRoom)).catch(() => undefined);
  }, [draftsByRoom, savedDataReady]);

  useEffect(() => {
    if (!savedDataReady) return;
    void AsyncStorage.setItem(SAVED_MESSAGES_KEY, JSON.stringify(savedMessages.slice(0, 200))).catch(() => undefined);
  }, [savedMessages, savedDataReady]);

  useEffect(() => {
    if (!activeRoom) return;
    setMessageDraft(draftsByRoom[activeRoom.id] ?? '');
    setReplyingTo(null);
    setEditingMessageId(null);
  }, [activeRoom?.id]);

  useEffect(() => {
    if (!activeRoom || !savedDataReady || editingMessageId) return;
    setDraftsByRoom(previous => {
      const next = { ...previous };
      if (messageDraft.trim()) next[activeRoom.id] = messageDraft;
      else delete next[activeRoom.id];
      return next;
    });
  }, [messageDraft, activeRoom?.id, savedDataReady, editingMessageId]);

  useEffect(() => {
    Animated.timing(heroMotion, { toValue: 1, duration: motionEnabled ? 700 : 0, useNativeDriver: true }).start();
  }, [heroMotion, motionEnabled]);

  useEffect(() => {
    tabMotion.setValue(motionEnabled ? 0 : 1);
    Animated.spring(tabMotion, { toValue: 1, useNativeDriver: true, damping: 22, stiffness: 220, mass: 0.7 }).start();
  }, [tab, tabMotion, motionEnabled]);

  // Refresh conversation membership so newly invited group members see the room.
  useEffect(() => {
    if (!apiToken) return;
    let cancelled = false;
    const refreshConversations = async () => {
      try {
        const result = await listConversations(apiToken);
        if (!cancelled) setRooms(result.conversations.map(item => ({
          id: item.id,
          title: item.title,
          subtitle: item.lastMessage || item.description || (lang === 'fa' ? 'گفت‌وگوی وطن' : 'Vatan conversation'),
          icon: item.kind === 'channel' ? 'megaphone' : item.kind === 'direct' ? 'person' : 'people',
          kind: item.kind,
          role: item.role,
          avatarUrl: item.avatarUrl
        })));
      } catch {
        // Preserve the current list during temporary network interruptions.
      }
    };
    const timer = setInterval(() => { void refreshConversations(); }, 8000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [apiToken, lang]);
  const filteredChats = useMemo(() => rooms
    .filter(room => (room.title + ' ' + room.subtitle).toLowerCase().includes(search.toLowerCase()))
    .filter(room => chatFilter === 'all' || (chatFilter === 'pinned' ? pinnedRoomIds.includes(room.id) : room.kind === chatFilter))
    .sort((a, b) => Number(pinnedRoomIds.includes(b.id)) - Number(pinnedRoomIds.includes(a.id))),
    [rooms, search, chatFilter, pinnedRoomIds]);

  const togglePinnedRoom = (room: Room) => {
    tapFeedback();
    setPinnedRoomIds(previous => previous.includes(room.id)
      ? previous.filter(id => id !== room.id)
      : [room.id, ...previous]);
  };

  const forwardSelectedMessages = async (target: Room) => {
    if (!apiToken || selectedMessageIds.length === 0) return;
    const chosen = messages.filter(message => selectedMessageIds.includes(message.id) && !message.id.startsWith('local-'));
    if (!chosen.length) { showAlert(lang === 'fa' ? 'پیام قابل انتقالی انتخاب نشده.' : 'No sendable messages selected.'); return; }
    setBusy(true);
    try {
      for (const message of chosen) {
        const attachmentNames = (message.attachments ?? []).map(file => file.name).join(', ');
        const original = message.body.trim() || (attachmentNames ? `📎 ${attachmentNames}` : '');
        if (!original) continue;
        const body = `${lang === 'fa' ? '↪ پیام انتقال‌یافته از' : '↪ Forwarded from'} ${message.displayName || message.username}:\n${original}`;
        await sendMessage(apiToken, target.id, body, { clientMessageId: `fwd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` });
      }
      setSelectedMessageIds([]);
      setModal(null);
      showAlert(lang === 'fa' ? `پیام‌ها به «${target.title}» منتقل شدند.` : `Messages forwarded to ${target.title}.`);
      await loadConversations(apiToken);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : (lang === 'fa' ? 'انتقال پیام ناموفق بود.' : 'Forwarding failed.'));
    } finally { setBusy(false); }
  };

  const toggleSavedMessage = (message: VatanMessage) => {
    setSavedMessages(previous => previous.some(item => item.id === message.id && item.conversationId === message.conversationId)
      ? previous.filter(item => !(item.id === message.id && item.conversationId === message.conversationId))
      : [{ ...message, savedAt: new Date().toISOString() }, ...previous].slice(0, 200));
  };

  const openSavedMessage = (message: SavedMessage) => {
    const room = rooms.find(item => item.id === message.conversationId);
    if (!room) { showAlert(lang === 'fa' ? 'گفت‌وگوی اصلی در دسترس نیست.' : 'The original conversation is unavailable.'); return; }
    setActiveRoom(room);
    setMessages([]);
    setModal('chat');
  };

  const showAlert = (message: string) => Alert.alert(t.brand, message);
  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { showAlert(lang === 'fa' ? 'برای انتخاب عکس، اجازه دسترسی به گالری را بده.' : 'Please allow photo library access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (!result.canceled && result.assets[0]) setPhoto(result.assets[0].uri);
  };
  const loadConversations = async (token: string) => {
    const result = await listConversations(token);
    setRooms(result.conversations.map(item => ({
      id: item.id,
      title: item.title,
      subtitle: item.lastMessage || item.description || (lang === 'fa' ? 'گفت‌وگوی وطن' : 'Vatan conversation'),
      icon: item.kind === 'channel' ? 'megaphone' : item.kind === 'direct' ? 'person' : 'people',
      kind: item.kind,
      role: item.role
    })));
  };

  // Restore the bearer session on launch. Mobile uses OS-backed secure storage;
  // web uses browser storage because SecureStore is not available there.
  useEffect(() => {
    let cancelled = false;
    const restoreSession = async () => {
      try {
        const token = await readSavedSession();
        if (!token) return;
        const user = await getMyProfile(token);
        const conversations = await listConversations(token);
        if (cancelled) return;
        setApiToken(token);
        setUserId(user.id);
        setUsername(user.username);
        setDisplayName(user.displayName);
        setPhoto(user.avatarUrl);
        setWebsiteUrl(user.websiteUrl ?? ''); setInstagramUrl(user.instagramUrl ?? ''); setTelegramUrl(user.telegramUrl ?? ''); setYoutubeUrl(user.youtubeUrl ?? '');
        setBirthYear(user.birthYear == null ? '' : String(user.birthYear));
        setCalendar(user.birthCalendar === 'gregorian' ? 'gregorian' : 'solar');
        setRooms(conversations.conversations.map(item => ({
          id: item.id,
          title: item.title,
          subtitle: item.lastMessage || item.description || (lang === 'fa' ? 'گفت‌وگوی وطن' : 'Vatan conversation'),
          icon: item.kind === 'channel' ? 'megaphone' : item.kind === 'direct' ? 'person' : 'people',
          kind: item.kind,
          role: item.role,
          avatarUrl: item.avatarUrl
        })));
        void registerPushForSession(token);
      } catch {
        await clearSavedSession().catch(() => undefined);
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    };
    void restoreSession();
    return () => { cancelled = true; };
  }, []);

  const loginToApi = async () => {
    const safeUsername = loginUsername.trim();
    if (!safeUsername) { showAlert(lang === 'fa' ? 'یک نام کاربری وارد کن.' : 'Enter a demo username.'); return; }
    setBusy(true);
    try {
      if (loginPassword.length < 8) {
        showAlert(lang === 'fa' ? 'رمز عبور باید حداقل ۸ نویسه باشد.' : 'Password must be at least 8 characters.');
        return;
      }
      const result = loginMode === 'register'
        ? await registerAccount({ username: safeUsername, displayName: loginDisplayName.trim() || safeUsername, password: loginPassword })
        : await loginWithPassword({ username: safeUsername, password: loginPassword });
      await saveSession(result.token);
      setApiToken(result.token);
      setUserId(result.user.id);
      setUsername(result.user.username);
      setDisplayName(result.user.displayName);
      setPhoto(result.user.avatarUrl);
      setWebsiteUrl(result.user.websiteUrl ?? ''); setInstagramUrl(result.user.instagramUrl ?? ''); setTelegramUrl(result.user.telegramUrl ?? ''); setYoutubeUrl(result.user.youtubeUrl ?? '');
      setBirthYear(result.user.birthYear == null ? '' : String(result.user.birthYear));
      setCalendar(result.user.birthCalendar === 'gregorian' ? 'gregorian' : 'solar');
      await loadConversations(result.token);
      void registerPushForSession(result.token);
      setModal(null);
      setLoginPassword('');
      showAlert(lang === 'fa' ? 'با موفقیت وارد وطن شدی.' : 'You are signed in to Vatan.');
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'API sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const signOutEverywhere = async () => {
    const token = apiToken;
    setBusy(true);
    try { if (token) await logoutAllSessions(token); }
    catch (error) { showAlert(error instanceof Error ? error.message : 'Could not revoke other sessions.'); return; }
    finally { setBusy(false); }
    await clearSavedSession().catch(() => undefined);
    setApiToken(null); setUserId(null); setRooms([]); setMessages([]); setActiveRoom(null); setModal(null);
  };

  const signOut = async () => {
    const token = apiToken;
    setBusy(true);
    try {
      if (token) await logoutFromApi(token);
    } catch {
      // Local credentials must still be removed even if the network is offline.
    } finally {
      await clearSavedSession().catch(() => undefined);
      setApiToken(null);
      setUserId(null);
      setRooms([]);
      setMessages([]);
      setActiveRoom(null);
      setModal(null);
      setBusy(false);
    }
  };

  const createRoom = async () => {
    if (!roomName.trim()) { showAlert(lang === 'fa' ? 'اول یک نام وارد کن.' : 'Please enter a name first.'); return; }
    if (!apiToken) {
      showAlert(lang === 'fa' ? 'اول از بخش ورود آزمایشی به API وصل شو.' : 'Connect to the API first.');
      setModal('login');
      return;
    }
    setBusy(true);
    try {
      const result = modal === 'channel'
        ? await createChannel(apiToken, roomName.trim(), roomDescription.trim())
        : await createGroup(apiToken, roomName.trim(), roomDescription.trim());
      const conversation = result.conversation;
      const room: Room = {
        id: conversation.id,
        title: conversation.title,
        subtitle: conversation.description || (lang === 'fa' ? 'تازه ساخته شده' : 'Just created'),
        icon: conversation.kind === 'channel' ? 'megaphone' : 'people',
        kind: conversation.kind,
        role: conversation.role
      };
      setRooms(prev => [room, ...prev.filter(item => item.id !== room.id)]);
      setRoomName('');
      setRoomDescription('');
      setModal(null);
      setTab(conversation.kind === 'channel' ? 'channels' : 'groups');
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Could not create conversation.');
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    if (!apiToken) {
      showAlert(lang === 'fa' ? 'برای ذخیره پروفایل اول به API وصل شو.' : 'Connect to the API before saving your profile.');
      setModal('login');
      return;
    }
    const parsedYear = birthYear.trim() ? Number.parseInt(birthYear, 10) : null;
    if (parsedYear !== null && !Number.isFinite(parsedYear)) {
      showAlert(lang === 'fa' ? 'سال تولد معتبر نیست.' : 'Invalid birth year.');
      return;
    }
    setBusy(true);
    try {
      // Upload a newly selected local image first. Remote URLs are already saved avatars.
      let savedAvatarUrl = photo;
      if (photo && !/^https:\/\//i.test(photo)) {
        const uploadedUser = await uploadProfilePhoto(apiToken, photo);
        savedAvatarUrl = uploadedUser.avatarUrl;
      }
      const user = await updateMyProfile(apiToken, {
        displayName: displayName.trim(),
        username: username.trim(),
        birthYear: parsedYear,
        birthCalendar: calendar === 'solar' ? 'solar_hijri' : 'gregorian',
        ...(savedAvatarUrl !== undefined ? { avatarUrl: savedAvatarUrl } : {}),
        websiteUrl: websiteUrl.trim() || null,
        instagramUrl: instagramUrl.trim() || null,
        telegramUrl: telegramUrl.trim() || null,
        youtubeUrl: youtubeUrl.trim() || null
      });
      setPhoto(user.avatarUrl);
      setWebsiteUrl(user.websiteUrl ?? ''); setInstagramUrl(user.instagramUrl ?? ''); setTelegramUrl(user.telegramUrl ?? ''); setYoutubeUrl(user.youtubeUrl ?? '');
      setDisplayName(user.displayName);
      setUsername(user.username);
      setBirthYear(user.birthYear == null ? '' : String(user.birthYear));
      setCalendar(user.birthCalendar === 'gregorian' ? 'gregorian' : 'solar');
      setModal(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Could not save profile.');
    } finally {
      setBusy(false);
    }
  };

  const openUserProfile = async (person: Pick<VatanUser, 'username' | 'displayName' | 'avatarUrl' | 'id'>) => {
    setSelectedProfile({ ...person, birthYear: null, birthCalendar: null });
    setModal('userProfile');
    if (!apiToken || !person.username) return;
    setProfileLoading(true);
    try { setSelectedProfile(await getUserProfile(apiToken, person.username)); }
    catch (error) { showAlert(error instanceof Error ? error.message : (lang === 'fa' ? 'نمایش پروفایل ممکن نشد.' : 'Could not load profile.')); }
    finally { setProfileLoading(false); }
  };

  const searchForUsers = async () => {
    if (!apiToken) { setModal('login'); return; }
    if (contactsQuery.trim().length < 2) { showAlert(lang === 'fa' ? 'حداقل دو نویسه وارد کن.' : 'Enter at least two characters.'); return; }
    setBusy(true);
    try { setFoundUsers((await searchUsers(apiToken, contactsQuery.trim())).users); }
    catch (error) { showAlert(error instanceof Error ? error.message : 'Could not search users.'); }
    finally { setBusy(false); }
  };

  const startDirectChat = async (person: VatanUser) => {
    if (!apiToken) { setModal('login'); return; }
    setBusy(true);
    try {
      const conversation = (await createDirectConversation(apiToken, person.username)).conversation;
      const room: Room = { id: conversation.id, title: conversation.title || person.displayName, subtitle: '@' + person.username, icon: 'person', kind: 'direct', avatarUrl: person.avatarUrl };
      setRooms(previous => [room, ...previous.filter(item => item.id !== room.id)]);
      setTab('chats'); setActiveRoom(room); setMessages([]); setMessageDraft(''); setModal('chat');
    } catch (error) { showAlert(error instanceof Error ? error.message : 'Could not start chat.'); }
    finally { setBusy(false); }
  };

  const inviteMember = async () => {
    if (!apiToken || !activeRoom || activeRoom.kind !== 'group' || !memberUsername.trim()) return;
    setBusy(true);
    try {
      await addConversationMember(apiToken, activeRoom.id, memberUsername.trim());
      showAlert(lang === 'fa' ? 'کاربر به گروه اضافه شد.' : 'User added to the group.'); setMemberUsername('');
    } catch (error) { showAlert(error instanceof Error ? error.message : 'Could not add member.'); }
    finally { setBusy(false); }
  };

  const searchMessagesInRoom = async () => {
    if (!apiToken || !activeRoom || messageSearchQuery.trim().length < 2) {
      showAlert(lang === 'fa' ? 'برای جست‌وجو حداقل دو نویسه وارد کن.' : 'Enter at least two characters.');
      return;
    }
    setBusy(true);
    try {
      setMessageSearchResults((await searchConversationMessages(apiToken, activeRoom.id, messageSearchQuery.trim())).messages);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Could not search messages.');
    } finally { setBusy(false); }
  };

  const openGroupSettings = async () => {
    if (!apiToken || !activeRoom || activeRoom.kind === 'direct') return;
    setBusy(true);
    try {
      const [settings, membersResult] = await Promise.all([
        getConversationSettings(apiToken, activeRoom.id),
        getConversationMembers(apiToken, activeRoom.id)
      ]);
      setGroupSettings(settings);
      setGroupMembers(membersResult.members);
      setRoomName(settings.title);
      setRoomDescription(settings.description ?? '');
      setModal('groupSettings');
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Could not load group settings.');
    } finally {
      setBusy(false);
    }
  };

  const leaveCurrentGroup = async () => {
    if (!apiToken || !activeRoom) return;
    const role = groupMembers.find(member => member.id === userId)?.role;
    if (role === 'owner') {
      showAlert(lang === 'fa' ? 'قبل از خروج، مالکیت گروه را به عضو دیگری منتقل کن.' : 'Transfer ownership before leaving the group.');
      return;
    }
    setBusy(true);
    try {
      await leaveConversation(apiToken, activeRoom.id);
      setRooms(previous => previous.filter(room => room.id !== activeRoom.id));
      setActiveRoom(null);
      setModal(null);
      setTab('groups');
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Could not leave group.');
    } finally { setBusy(false); }
  };

  const deleteCurrentGroup = () => {
    if (!apiToken || !activeRoom || activeRoom.kind !== 'group') return;
    const isOwner = groupMembers.some(member => member.id === userId && member.role === 'owner');
    if (!isOwner) {
      showAlert(lang === 'fa' ? 'فقط مالک گروه می‌تواند گروه را حذف کند.' : 'Only the group owner can delete this group.');
      return;
    }
    Alert.alert(
      lang === 'fa' ? 'حذف دائمی گروه؟' : 'Delete group permanently?',
      lang === 'fa' ? 'گروه، اعضا و پیام‌های آن حذف می‌شوند. این کار قابل بازگشت نیست.' : 'The group, its members, and its messages will be deleted. This cannot be undone.',
      [
        { text: t.cancel, style: 'cancel' },
        { text: lang === 'fa' ? 'حذف گروه' : 'Delete group', style: 'destructive', onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await deleteConversation(apiToken, activeRoom.id);
              setRooms(previous => previous.filter(room => room.id !== activeRoom.id));
              setActiveRoom(null);
              setMessages([]);
              setModal(null);
              setTab('groups');
              showAlert(lang === 'fa' ? 'گروه حذف شد.' : 'Group deleted.');
            } catch (error) {
              showAlert(error instanceof Error ? error.message : 'Could not delete group.');
            } finally {
              setBusy(false);
            }
          })();
        } }
      ]
    );
  };

  const saveGroupSettings = async () => {
    if (!apiToken || !activeRoom || !groupSettings) return;
    setBusy(true);
    try {
      const updated = await updateConversationSettings(apiToken, activeRoom.id, {
        title: roomName.trim(),
        description: roomDescription.trim(),
        themeKey: groupSettings.themeKey,
        themeMode: groupSettings.themeMode,
        avatarUrl: groupSettings.avatarUrl,
        memberCanSend: groupSettings.memberCanSend,
        memberCanInvite: groupSettings.memberCanInvite,
        memberCanPin: groupSettings.memberCanPin,
        slowModeSeconds: groupSettings.slowModeSeconds
      });
      setGroupSettings(updated);
      const nextRoom = { ...activeRoom, title: updated.title, subtitle: updated.description || activeRoom.subtitle };
      setActiveRoom(nextRoom);
      setRooms(previous => previous.map(room => room.id === nextRoom.id ? nextRoom : room));
      setModal('chat');
      showAlert(lang === 'fa' ? 'تنظیمات گروه ذخیره شد.' : 'Group settings saved.');
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Could not save group settings.');
    } finally {
      setBusy(false);
    }
  };

  const actOnMember = async (member: VatanMember, action: 'remove' | 'promote' | 'demote' | 'transfer') => {
    if (!apiToken || !activeRoom) return;
    const isOwner = groupMembers.some(item => item.id === userId && item.role === 'owner');
    if (action === 'transfer' && !isOwner) return;
    setBusy(true);
    try {
      if (action === 'remove') await removeConversationMember(apiToken, activeRoom.id, member.id);
      if (action === 'promote') await setConversationMemberRole(apiToken, activeRoom.id, member.id, 'admin');
      if (action === 'demote') await setConversationMemberRole(apiToken, activeRoom.id, member.id, 'member');
      if (action === 'transfer') await transferConversationOwnership(apiToken, activeRoom.id, member.id);
      const [membersResult, settings] = await Promise.all([
        getConversationMembers(apiToken, activeRoom.id),
        getConversationSettings(apiToken, activeRoom.id)
      ]);
      setGroupMembers(membersResult.members);
      setGroupSettings(settings);
      showAlert(lang === 'fa' ? 'مدیریت اعضا به‌روزرسانی شد.' : 'Member settings updated.');
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Could not update member.');
    } finally {
      setBusy(false);
    }
  };

  const openRoom = (room: Room) => {
    tapFeedback();
    chatTransition.setValue(isRTL ? Dimensions.get('window').width : -Dimensions.get('window').width);
    Animated.spring(chatTransition, { toValue: 0, useNativeDriver: true, damping: 24, stiffness: 220, mass: 0.8 }).start();
    if (!apiToken) {
      showAlert(lang === 'fa' ? 'اول به API وصل شو.' : 'Connect to the API first.');
      setModal('login');
      return;
    }
    setActiveRoom(room);
    setMessages([]);
    setMessageDraft('');
    setReplyingTo(null);
    setEditingMessageId(null);
    setGroupMembers([]);
    setGroupSettings(null);
    setModal('chat');
    if (room.kind === 'group') {
      void Promise.all([getConversationSettings(apiToken, room.id), getConversationMembers(apiToken, room.id)])
        .then(([settings, members]) => { setGroupSettings(settings); setGroupMembers(members.members); })
        .catch(() => undefined);
    }
  };

  const uploadFileToRoom = async (file: { uri: string; name: string; type: string }) => {
    if (!apiToken || !activeRoom) return;
    setBusy(true);
    try {
      const result = await uploadConversationAttachment(apiToken, activeRoom.id, file);
      setMessages(previous => [...previous, { ...result.message, status: 'sent' }]);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Upload failed.');
    } finally { setBusy(false); }
  };

  const toggleVoiceRecording = async () => {
    if (!apiToken || !activeRoom) { showAlert(lang === 'fa' ? 'برای ارسال ویس ابتدا وارد حساب شو و یک گفتگو باز کن.' : 'Sign in and open a chat before recording.'); return; }
    if (voiceRecording) {
      const recording = voiceRecording;
      setVoiceRecording(null);
      try {
        await recording.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
        const uri = recording.getURI();
        if (!uri) throw new Error('Recording file was not created.');
        await uploadFileToRoom({ uri, name: 'voice-note.m4a', type: 'audio/mp4' });
      } catch (error) {
        showAlert(error instanceof Error ? error.message : (lang === 'fa' ? 'ارسال ویس ناموفق بود.' : 'Could not send voice note.'));
      }
      return;
    }
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) { showAlert(lang === 'fa' ? 'برای ضبط ویس اجازه میکروفون لازم است.' : 'Microphone permission is required to record voice notes.'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const result = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setVoiceRecording(result.recording);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : (lang === 'fa' ? 'ضبط ویس شروع نشد.' : 'Could not start recording.'));
    }
  };

  const playVoiceAttachment = async (url: string, name: string) => {
    if (!apiToken) return;
    try {
      if (voiceSoundRef.current) {
        await voiceSoundRef.current.unloadAsync().catch(() => undefined);
        voiceSoundRef.current = null;
      }
      const safeName = name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'voice-note.m4a';
      const destination = (FileSystem.cacheDirectory || '') + safeName;
      const download = await FileSystem.downloadAsync(url, destination, { headers: { Authorization: `Bearer ${apiToken}` } });
      const created = await Audio.Sound.createAsync({ uri: download.uri }, { shouldPlay: true });
      voiceSoundRef.current = created.sound;
      created.sound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded && status.didJustFinish) {
          void created.sound.unloadAsync().catch(() => undefined);
          if (voiceSoundRef.current === created.sound) voiceSoundRef.current = null;
        }
      });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : (lang === 'fa' ? 'پخش ویس ممکن نشد.' : 'Could not play voice note.'));
    }
  };

  const pickMediaForChat = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: false, quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await uploadFileToRoom({
      uri: asset.uri,
      name: asset.fileName || (asset.type === 'video' ? 'video.mp4' : 'image.jpg'),
      type: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg')
    });
  };

  const pickDocumentForChat = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets[0]) return;
    const file = result.assets[0];
    await uploadFileToRoom({ uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' });
  };

  const openAttachment = async (url: string, name: string) => {
    if (!apiToken) return;
    try {
      if (Platform.OS === 'web') {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${apiToken}` } });
        if (!response.ok) throw new Error('Could not download attachment.');
        const blobUrl = URL.createObjectURL(await response.blob());
        window.open(blobUrl, '_blank');
      } else {
        const safeName = name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100) || 'attachment';
        const destination = (FileSystem.cacheDirectory || '') + safeName;
        const result = await FileSystem.downloadAsync(url, destination, { headers: { Authorization: `Bearer ${apiToken}` } });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri);
        else await Linking.openURL(result.uri);
      }
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Could not open attachment.');
    }
  };

  const submitMessage = async () => {
    if (!apiToken || !activeRoom || !messageDraft.trim()) return;
    tapFeedback();
    const body = messageDraft.trim();
    if (editingMessageId) {
      const targetId = editingMessageId;
      try {
        const result = await editMessage(apiToken, targetId, body);
        setMessages(previous => previous.map(message => message.id === targetId ? { ...result.message, status: 'sent' } : message));
        setEditingMessageId(null);
        setMessageDraft('');
      } catch (error) { showAlert(error instanceof Error ? error.message : 'Could not edit message.'); }
      return;
    }
    const clientMessageId = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    const localId = 'local-' + clientMessageId;
    const optimistic: VatanMessage = {
      id: localId, conversationId: activeRoom.id, senderId: userId ?? '',
      username, displayName, avatarUrl: photo, body, createdAt: new Date().toISOString(),
      replyToId: replyingTo?.id ?? null, status: 'sending', clientMessageId
    };
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMessages(previous => [...previous, optimistic]);
    setMessageDraft('');
    setReplyingTo(null);
    try {
      const result = await sendMessage(apiToken, activeRoom.id, body, { replyToId: optimistic.replyToId, clientMessageId });
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMessages(previous => previous.map(message => message.id === localId ? { ...result.message, status: 'sent', clientMessageId } : message));
    } catch (error) {
      setMessages(previous => previous.map(message => message.id === localId ? { ...message, status: 'failed' } : message));
      showAlert(error instanceof Error ? error.message : 'Could not send message.');
    }
  };

  const retryMessage = async (message: VatanMessage) => {
    if (!apiToken || !activeRoom || !message.clientMessageId) return;
    setMessages(previous => previous.map(item => item.id === message.id ? { ...item, status: 'sending' } : item));
    try {
      const result = await sendMessage(apiToken, activeRoom.id, message.body, { replyToId: message.replyToId, clientMessageId: message.clientMessageId });
      setMessages(previous => previous.map(item => item.id === message.id ? { ...result.message, status: 'sent', clientMessageId: message.clientMessageId } : item));
    } catch {
      setMessages(previous => previous.map(item => item.id === message.id ? { ...item, status: 'failed' } : item));
    }
  };

  const reactToMessage = async (message: VatanMessage, reaction: string) => {
    if (!apiToken || message.id.startsWith('local-')) return;
    try {
      const result = await toggleMessageReaction(apiToken, message.id, reaction);
      setMessageReactions(previous => ({ ...previous, [message.id]: result.reactions }));
    } catch (error) { showAlert(error instanceof Error ? error.message : 'Could not react to message.'); }
  };

  const removeMessage = async (message: VatanMessage) => {
    if (!apiToken || message.id.startsWith('local-')) return;
    try {
      await deleteMessage(apiToken, message.id);
      setMessages(previous => previous.filter(item => item.id !== message.id));
    } catch (error) { showAlert(error instanceof Error ? error.message : 'Could not delete message.'); }
  };

  useEffect(() => {
    if (modal !== 'chat' || !apiToken || !activeRoom) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const result = await getMessages(apiToken, activeRoom.id);
        if (!cancelled) {
          setMessages(previous => {
            const pending = previous.filter(message => message.status === 'sending' || message.status === 'failed');
            const serverIds = new Set(result.messages.map(message => message.id));
            const serverClientIds = new Set(result.messages.map(message => message.clientMessageId).filter(Boolean));
            return [...result.messages, ...pending.filter(message => !serverIds.has(message.id) && !(message.clientMessageId && serverClientIds.has(message.clientMessageId)))];
          });
          const last = result.messages[result.messages.length - 1];
          if (last) void markMessagesRead(apiToken, activeRoom.id, last.id).catch(() => undefined);
        }
      } catch {
        // Keep the current messages visible if a polling request temporarily fails.
      }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [modal, apiToken, activeRoom?.id]);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => Animated.spring(composerLift, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 2 }).start());
    const hide = Keyboard.addListener(hideEvent, () => Animated.spring(composerLift, { toValue: 0, useNativeDriver: true, speed: 24, bounciness: 2 }).start());
    return () => { show.remove(); hide.remove(); };
  }, [composerLift]);

  const labelForTab = (x: Tab) => x === 'saved' ? t.savedTab : t[x as Exclude<Tab, 'saved'>];
  const canManageGroup = groupMembers.some(member => member.id === userId && ['owner', 'admin'].includes(member.role));
  const groupAccent = ({ violet: '#5B52E8', blue: '#2878E8', green: '#159A73', rose: '#E34E86', amber: '#D98B16', midnight: '#202B45', ocean: '#008DA8' } as Record<string, string>)[groupSettings?.themeKey ?? 'violet'] ?? c.primary;

  const Header = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <Animated.View style={[styles.headerShell, {
      backgroundColor: dark ? 'rgba(16,24,42,0.84)' : 'rgba(255,255,255,0.9)',
      borderColor: c.border,
      opacity: heroMotion,
      transform: [{ translateY: heroMotion.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }]
    }]}>
      <BlurView intensity={dark ? 32 : 45} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[styles.headerBrandMark, { backgroundColor: c.primary }]}>
          <Ionicons name="chatbubbles" size={21} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
          <Text style={[styles.brandSmall, { color: c.text }]}>{title}</Text>
          {!!subtitle && <Text style={[styles.headerSub, { color: c.muted, textAlign: isRTL ? 'right' : 'left' }]}>{subtitle}</Text>}
        </View>
        <Pressable onPress={() => { tapFeedback(); setModal('profile'); }} style={[styles.avatarButton, { backgroundColor: c.soft, borderColor: c.border, borderWidth: 1 }]}>
          {photo ? <Image source={{ uri: photo }} style={styles.avatarSmall} /> : <Ionicons name="person" size={20} color={c.primary} />}
        </Pressable>
      </View>
    </Animated.View>
  );

  const Avatar = ({ icon, color, size = 54, uri }: { icon: string; color: string; size?: number; uri?: string | null }) => (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color + '20', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {uri ? <Image source={{ uri }} style={{ width: size, height: size }} /> : <Ionicons name={icon as any} size={size * 0.43} color={color} />}
    </View>
  );

  const SectionTitle = ({ title, action }: { title: string; action?: string }) => (
    <View style={[styles.sectionRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <Text style={[styles.sectionTitle, { color: c.text }]}>{title}</Text>
      {!!action && <Pressable onPress={() => setTab('chats')}><Text style={{ color: c.primary, fontWeight: '700' }}>{action}</Text></Pressable>}
    </View>
  );

  

  const renderRoom = (room: Room) => {
    const pinned = pinnedRoomIds.includes(room.id);
    const pressScale = roomPressScales[room.id] ?? (roomPressScales[room.id] = new Animated.Value(1));
    const animatePress = (toValue: number) => Animated.spring(pressScale, { toValue, useNativeDriver: true, speed: 30, bounciness: 5 }).start();
    return <Animated.View key={room.id} style={{ transform: [{ scale: pressScale }] }}><Pressable onPress={() => openRoom(room)} onPressIn={() => animatePress(0.975)} onPressOut={() => animatePress(1)} onLongPress={() => togglePinnedRoom(room)} delayLongPress={420}
      style={[styles.chatRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: c.border, paddingHorizontal: 8, borderRadius: 16, backgroundColor: pinned ? c.soft + '66' : 'transparent' }]}>
      <Avatar icon={room.icon} color={room.kind === 'group' ? '#10B981' : room.kind === 'channel' ? '#2878E8' : c.primary} size={52} uri={room.avatarUrl} />
      <View style={[styles.chatInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 5, maxWidth: '100%' }}>
          <Text numberOfLines={1} style={[styles.chatTitle, { color: c.text, flexShrink: 1 }]}>{room.title}</Text>
          {pinned && <Ionicons name="pin" size={12} color={c.primary} />}
        </View>
        <Text numberOfLines={1} style={[styles.chatSubtitle, { color: c.muted }]}>{room.subtitle}</Text>
        {room.kind === 'channel' && <Text numberOfLines={1} style={{ color: c.primary, fontSize: 10, fontWeight: '700', marginTop: 2 }}>{lang === 'fa' ? `شناسه کانال: ${room.id}` : `Channel ID: ${room.id}`}</Text>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={pinned ? (lang === 'fa' ? 'برداشتن سنجاق گفتگو' : 'Unpin conversation') : (lang === 'fa' ? 'سنجاق کردن گفتگو' : 'Pin conversation')}
        onPress={() => togglePinnedRoom(room)} hitSlop={8} style={{ padding: 7, borderRadius: 12, backgroundColor: pinned ? c.primary + '18' : 'transparent' }}>
        <Ionicons name={pinned ? 'pin' : 'pin-outline'} size={17} color={pinned ? c.primary : c.muted} />
      </Pressable>
    </Pressable></Animated.View>;
  };

  const renderHome = () => {
    const filters: { key: 'all' | 'direct' | 'group' | 'channel' | 'pinned'; label: string; icon: any }[] = [
      { key: 'all', label: lang === 'fa' ? 'همه' : 'All chats', icon: 'chatbubbles-outline' },
      { key: 'direct', label: lang === 'fa' ? 'شخصی' : 'Private', icon: 'person-outline' },
      { key: 'group', label: t.groups, icon: 'people-outline' },
      { key: 'channel', label: t.channels, icon: 'megaphone-outline' },
      { key: 'pinned', label: lang === 'fa' ? 'سنجاق‌شده' : 'Pinned', icon: 'pin-outline' }
    ];
    const pinnedCount = rooms.filter(room => pinnedRoomIds.includes(room.id)).length;
    return <>
      <View style={[styles.inboxIntro, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={{ flex: 1, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
          <Text style={[styles.inboxEyebrow, { color: c.primary }]}>{lang === 'fa' ? 'پیام‌رسان شما' : 'YOUR MESSENGER'}</Text>
          <Text style={[styles.inboxTitle, { color: c.text, textAlign: isRTL ? 'right' : 'left' }]}>{lang === 'fa' ? 'گفت‌وگوها' : 'Messages'}</Text>
          <Text style={[styles.inboxSubtitle, { color: c.muted, textAlign: isRTL ? 'right' : 'left' }]}>{lang === 'fa' ? 'همه ارتباطاتت، مرتب و یک‌جا' : 'Every conversation, neatly in one place'}</Text>
        </View>
        <Pressable onPress={() => { tapFeedback(); setTab('contacts'); }} style={[styles.newChatFab, { backgroundColor: c.primary }]} accessibilityRole="button">
          <Ionicons name="create-outline" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={[styles.searchBox, styles.inboxSearch, { backgroundColor: c.surface, borderColor: c.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Ionicons name="search" size={19} color={c.primary} />
        <TextInput value={search} onChangeText={setSearch} placeholder={t.search} placeholderTextColor={c.muted} style={[styles.searchInput, { color: c.text, textAlign: isRTL ? 'right' : 'left' }]} />
        {!!search && <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color={c.muted} /></Pressable>}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4, paddingBottom: 15 }}>
        {filters.map(filter => {
          const active = chatFilter === filter.key;
          return <Pressable key={filter.key} onPress={() => setChatFilter(filter.key)}
            style={[styles.inboxFilter, { backgroundColor: active ? c.primary : c.surface, borderColor: active ? c.primary : c.border, flexDirection: 'row', gap: 6 }]}>
            <Ionicons name={filter.icon} size={15} color={active ? '#FFFFFF' : c.muted} />
            <Text style={{ color: active ? '#FFFFFF' : c.muted, fontSize: 11, fontWeight: '800' }}>{filter.label}</Text>
            {filter.key === 'pinned' && pinnedCount > 0 && <View style={[styles.filterCount, { backgroundColor: active ? '#FFFFFF33' : c.soft }]}><Text style={{ color: active ? '#FFFFFF' : c.primary, fontSize: 9, fontWeight: '900' }}>{pinnedCount}</Text></View>}
          </Pressable>;
        })}
      </ScrollView>

      {pinnedCount > 0 && chatFilter === 'all' && !search && <View style={{ marginBottom: 16 }}>
        <View style={[styles.sectionRow, { flexDirection: isRTL ? 'row-reverse' : 'row', marginBottom: 9 }]}>
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 7 }}>
            <Ionicons name="pin" size={15} color={c.primary} />
            <Text style={[styles.inboxSectionTitle, { color: c.text }]}>{lang === 'fa' ? 'گفت‌وگوهای سنجاق‌شده' : 'Pinned chats'}</Text>
          </View>
          <Pressable onPress={() => setChatFilter('pinned')}><Text style={{ color: c.primary, fontSize: 11, fontWeight: '800' }}>{lang === 'fa' ? 'همه' : 'View all'}</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 3 }}>
          {rooms.filter(room => pinnedRoomIds.includes(room.id)).map(room => <Pressable key={room.id} onPress={() => openRoom(room)} style={[styles.pinnedTile, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Avatar icon={room.icon} color={room.kind === 'group' ? '#10B981' : room.kind === 'channel' ? '#2878E8' : c.primary} size={44} />
            <Text numberOfLines={1} style={{ color: c.text, fontSize: 11, fontWeight: '800', maxWidth: 100, marginTop: 7, textAlign: 'center' }}>{room.title}</Text>
            <Text numberOfLines={1} style={{ color: c.muted, fontSize: 9, marginTop: 3, maxWidth: 100 }}>{room.kind === 'group' ? (lang === 'fa' ? 'گروه' : 'Group') : room.kind === 'channel' ? (lang === 'fa' ? 'کانال' : 'Channel') : (lang === 'fa' ? 'شخصی' : 'Private')}</Text>
          </Pressable>)}
        </ScrollView>
      </View>}

      <View style={[styles.sectionRow, { flexDirection: isRTL ? 'row-reverse' : 'row', marginBottom: 10 }]}>
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[styles.inboxSectionTitle, { color: c.text }]}>{chatFilter === 'pinned' ? (lang === 'fa' ? 'سنجاق‌شده‌ها' : 'Pinned chats') : chatFilter === 'group' ? t.groups : chatFilter === 'channel' ? t.channels : chatFilter === 'direct' ? (lang === 'fa' ? 'گفت‌وگوهای شخصی' : 'Private chats') : t.recent}</Text>
          <View style={[styles.filterCount, { backgroundColor: c.soft }]}><Text style={{ color: c.primary, fontSize: 10, fontWeight: '900' }}>{filteredChats.length}</Text></View>
        </View>
        <Pressable onPress={() => setModal('group')} style={[styles.smallAction, { backgroundColor: c.soft }]}><Ionicons name="people-outline" size={15} color={c.primary} /><Text style={{ color: c.primary, fontSize: 10, fontWeight: '800' }}>{lang === 'fa' ? 'گروه جدید' : 'New group'}</Text></Pressable>
      </View>

      <View style={[styles.inboxList, { backgroundColor: c.surface, borderColor: c.border }]}>
        {filteredChats.map(renderRoom)}
        {filteredChats.length === 0 && <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 18 }}>
          <View style={[styles.emptyIllustration, { backgroundColor: c.soft }]}><Ionicons name={search ? 'search-outline' : chatFilter === 'pinned' ? 'pin-outline' : 'chatbubbles-outline'} size={28} color={c.primary} /></View>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '900', marginTop: 12 }}>{search ? (lang === 'fa' ? 'چیزی پیدا نشد' : 'No matches found') : chatFilter === 'pinned' ? (lang === 'fa' ? 'هنوز گفت‌وگویی سنجاق نکردی' : 'No pinned chats yet') : t.emptyTitle}</Text>
          <Text style={{ color: c.muted, fontSize: 11, textAlign: 'center', lineHeight: 18, marginTop: 5 }}>{search ? (lang === 'fa' ? 'عبارت دیگری را امتحان کن.' : 'Try another search term.') : chatFilter === 'pinned' ? (lang === 'fa' ? 'با زدن سنجاق کنار هر گفتگو، آن را اینجا نگه دار.' : 'Tap the pin beside a chat to keep it here.') : t.emptyBody}</Text>
          {!search && chatFilter === 'all' && <Pressable onPress={() => setTab('contacts')} style={[styles.primaryButton, { backgroundColor: c.primary, marginTop: 14 }]}><Ionicons name="person-add-outline" size={16} color="#FFFFFF" /><Text style={styles.primaryButtonText}>{lang === 'fa' ? 'پیدا کردن مخاطب' : 'Find people'}</Text></Pressable>}
        </View>}
      </View>
      <Text style={[styles.inboxHint, { color: c.muted }]}>{lang === 'fa' ? 'برای سنجاق یا برداشتن سنجاق، دکمهٔ سنجاق کنار گفتگو را بزن.' : 'Use the pin beside a chat to keep it at the top.'}</Text>
    </>;
  };

  const renderCollection = (kind: 'group' | 'channel') => {
    const list = rooms.filter(x => x.kind === kind);
    return <>
      <View style={[styles.collectionHero, { backgroundColor: c.soft, alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
        <Avatar icon={kind === 'group' ? 'people' : 'megaphone'} color={c.primary} size={66} />
        <Text style={[styles.pageTitle, { color: c.text }]}>{kind === 'group' ? t.groups : t.channels}</Text>
        <Text style={[styles.pageSubtitle, { color: c.muted, textAlign: isRTL ? 'right' : 'left' }]}>{t.emptyBody}</Text>
        <Pressable onPress={() => { setModal(kind); setRoomName(''); setRoomDescription(''); }} style={[styles.primaryButton, { backgroundColor: c.primary, marginTop: 14 }]}>
          <Ionicons name="add" size={20} color="#FFF" /><Text style={styles.primaryButtonText}>{kind === 'group' ? t.createGroup : t.createChannel}</Text>
        </Pressable>
      </View>
      {list.length > 0 ? <View style={[styles.listCard, { backgroundColor: c.surface, marginTop: 18 }]}>{list.map(renderRoom)}</View> :
        <View style={{ alignItems: 'center', padding: 28 }}><Text style={{ color: c.muted }}>{t.emptyTitle}</Text></View>}
    </>;
  };

  const renderContacts = () => (
    <>
      <View style={[styles.collectionHero, { backgroundColor: c.soft, alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
        <Avatar icon="people" color={c.primary} size={68} />
        <Text style={[styles.pageTitle, { color: c.text }]}>{t.contacts}</Text>
        <Text style={[styles.pageSubtitle, { color: c.muted, textAlign: isRTL ? 'right' : 'left' }]}>{lang === 'fa' ? 'کاربرها را با نام کاربری پیدا کن و مستقیم پیام بده.' : 'Find people by username and start a direct conversation.'}</Text>
        <View style={[styles.searchBox, { width: '100%', marginTop: 16, marginBottom: 0, backgroundColor: c.surface, borderColor: c.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TextInput value={contactsQuery} onChangeText={setContactsQuery} onSubmitEditing={() => { void searchForUsers(); }} placeholder={lang === 'fa' ? 'نام کاربری یا نام نمایشی' : 'Username or display name'} placeholderTextColor={c.muted} style={[styles.searchInput, { color: c.text, textAlign: isRTL ? 'right' : 'left' }]} returnKeyType="search" />
          <Pressable onPress={() => { void searchForUsers(); }}><Ionicons name="search" size={20} color={c.primary} /></Pressable>
        </View>
      </View>
      <View style={[styles.listCard, { backgroundColor: c.surface, marginTop: 16 }]}>
        {foundUsers.map(person => <View key={person.id} style={[styles.chatRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: c.border }]}>
          <Avatar icon="person" color={c.primary} uri={person.avatarUrl} />
          <View style={[styles.chatInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <Pressable onPress={() => { void openUserProfile(person); }} hitSlop={6}><Text style={[styles.chatTitle, { color: c.text }]}>{person.displayName}</Text></Pressable>
            <Pressable onPress={() => { void openUserProfile(person); }} hitSlop={6}><Text style={[styles.chatSubtitle, { color: c.muted }]}>@{person.username}</Text></Pressable>
          </View>
          <Pressable onPress={() => { void startDirectChat(person); }} hitSlop={8} style={{ padding: 8 }} accessibilityRole="button" accessibilityLabel={lang === 'fa' ? 'شروع گفتگو' : 'Start chat'}><Ionicons name="chatbubble-ellipses-outline" size={20} color={c.primary} /></Pressable>
        </View>)}
        {foundUsers.length === 0 && <Text style={[styles.emptyHint, { color: c.muted }]}>{busy ? '…' : t.noContacts}</Text>}
      </View>
    </>
  );

  const renderSavedMessages = () => (
    <>
      <View style={[styles.collectionHero, { backgroundColor: c.soft, alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
        <Avatar icon="bookmark" color={c.primary} size={62} />
        <Text style={[styles.pageTitle, { color: c.text }]}>{lang === 'fa' ? 'پیام‌های ذخیره‌شده' : 'Saved messages'}</Text>
        <Text style={[styles.pageSubtitle, { color: c.muted, textAlign: isRTL ? 'right' : 'left' }]}>{lang === 'fa' ? 'پیام‌های مهم را برای دسترسی سریع اینجا نگه دار. این فهرست فعلاً روی همین دستگاه ذخیره می‌شود.' : 'Keep important messages here for quick access. This list is currently stored on this device.'}</Text>
        <View style={[styles.filterCount, { backgroundColor: c.surface, alignSelf: isRTL ? 'flex-end' : 'flex-start', marginTop: 12, paddingHorizontal: 10 }]}><Text style={{ color: c.primary, fontSize: 11, fontWeight: '900' }}>{savedMessages.length} {lang === 'fa' ? 'پیام' : 'messages'}</Text></View>
      </View>
      <View style={[styles.listCard, { backgroundColor: c.surface, marginTop: 16 }]}>
        {savedMessages.map(message => <View key={`${message.conversationId}:${message.id}`} style={{ paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border, gap: 7 }}>
          <Pressable onPress={() => openSavedMessage(message)} style={{ gap: 5 }}>
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 7 }}><Ionicons name="bookmark" size={14} color={c.primary} /><Text style={{ color: c.primary, fontSize: 11, fontWeight: '900', flex: 1 }}>{rooms.find(room => room.id === message.conversationId)?.title ?? (lang === 'fa' ? 'گفت‌وگوی حذف‌شده' : 'Unavailable conversation')}</Text><Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={15} color={c.muted} /></View>
            <Text numberOfLines={4} style={{ color: c.text, fontSize: 13, lineHeight: 20, textAlign: isRTL ? 'right' : 'left' }}>{message.body || (message.attachments?.length ? message.attachments.map(file => file.name).join(', ') : (lang === 'fa' ? 'پیام رسانه‌ای' : 'Media message'))}</Text>
            <Text style={{ color: c.muted, fontSize: 9, textAlign: isRTL ? 'right' : 'left' }}>{message.displayName} · {new Date(message.createdAt).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US')}</Text>
          </Pressable>
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'flex-end' }}><Pressable onPress={() => toggleSavedMessage(message)} style={[styles.smallAction, { backgroundColor: c.soft }]}><Ionicons name="bookmark-outline" size={14} color="#E34E68" /><Text style={{ color: '#E34E68', fontSize: 10, fontWeight: '800' }}>{lang === 'fa' ? 'حذف از ذخیره‌ها' : 'Remove saved'}</Text></Pressable></View>
        </View>)}
        {savedMessages.length === 0 && <View style={{ alignItems: 'center', padding: 28, gap: 8 }}><Ionicons name="bookmark-outline" size={32} color={c.primary} /><Text style={{ color: c.text, fontSize: 14, fontWeight: '900' }}>{lang === 'fa' ? 'هنوز پیامی ذخیره نکردی' : 'Nothing saved yet'}</Text><Text style={{ color: c.muted, fontSize: 11, textAlign: 'center', lineHeight: 18 }}>{lang === 'fa' ? 'در یک گفتگو روی آیکون نشانک کنار پیام بزن تا اینجا نمایش داده شود.' : 'Tap the bookmark action under a message to keep it here.'}</Text></View>}
      </View>
    </>
  );

  const renderSettings = () => (
    <>
      <Pressable onPress={() => setModal('profile')} style={[styles.profileCard, { backgroundColor: c.surface, borderColor: c.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Avatar icon="person" color={c.primary} size={64} uri={photo} />
        <View style={[styles.profileCardInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
          <Text style={[styles.profileName, { color: c.text }]}>{displayName || t.profile}</Text>
          <Text style={{ color: c.muted }}>@{username || 'username'}</Text>
          <Text style={{ color: c.primary, fontWeight: '700', marginTop: 5 }}>{t.editProfile}  ›</Text>
        </View>
        <Ionicons name="create-outline" size={21} color={c.primary} />
      </Pressable>
      <Text style={[styles.settingSection, { color: c.muted }]}>{t.appearance}</Text>
      <View style={[styles.settingCard, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={[styles.settingRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.settingIcon, { backgroundColor: c.soft }]}><Ionicons name="moon-outline" size={20} color={c.primary} /></View>
          <Text style={[styles.settingLabel, { color: c.text }]}>{t.dark}</Text>
          <Switch value={dark} onValueChange={v => setTheme(v ? 'dark' : 'light')} trackColor={{ true: c.primary, false: c.border }} />
        </View>
        <View style={[styles.settingRow, { flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'flex-start' }]}>
          <View style={[styles.settingIcon, { backgroundColor: c.soft }]}><Ionicons name="color-palette-outline" size={20} color={c.primary} /></View>
          <View style={{ flex: 1, gap: 10 }}>
            <Text style={[styles.settingLabel, { color: c.text }]}>{lang === 'fa' ? 'رنگ اصلی برنامه' : 'Accent color'}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {([{key:'violet',color:'#8B7CFF'},{key:'blue',color:'#3D7EFF'},{key:'cyan',color:'#00B8D9'},{key:'rose',color:'#F06B9A'},{key:'green',color:'#27B98A'},{key:'amber',color:'#E6A23C'}] as const).map(item => <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={item.key} onPress={() => setAccentPreset(item.key)} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: item.color, alignItems: 'center', justifyContent: 'center', borderWidth: accentPreset === item.key ? 3 : 1, borderColor: accentPreset === item.key ? c.text : '#FFFFFF55' }}>{accentPreset === item.key && <Ionicons name="checkmark" size={15} color="#FFFFFF" />}</Pressable>)}
            </View>
          </View>
        </View>
        <View style={[styles.settingRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.settingIcon, { backgroundColor: c.soft }]}><Ionicons name="chatbox-ellipses-outline" size={20} color={c.primary} /></View>
          <Text style={[styles.settingLabel, { color: c.text, flex: 1 }]}>{lang === 'fa' ? 'چیدمان مینیمال پیام‌ها' : 'Compact message layout'}</Text>
          <Switch value={compactMessages} onValueChange={setCompactMessages} trackColor={{ true: c.primary, false: c.border }} />
        </View>
        <View style={[styles.settingRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.settingIcon, { backgroundColor: c.soft }]}><Ionicons name="sparkles-outline" size={20} color={c.primary} /></View>
          <Text style={[styles.settingLabel, { color: c.text, flex: 1 }]}>{lang === 'fa' ? 'انیمیشن‌های نرم' : 'Smooth animations'}</Text>
          <Switch value={motionEnabled} onValueChange={setMotionEnabled} trackColor={{ true: c.primary, false: c.border }} />
        </View>
        <View style={[styles.settingRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.settingIcon, { backgroundColor: c.soft }]}><Ionicons name="language-outline" size={20} color={c.primary} /></View>
          <Text style={[styles.settingLabel, { color: c.text }]}>{t.language}</Text>
          <View style={[styles.segment, { backgroundColor: c.input, flexDirection: 'row' }]}>
            {(['fa', 'en'] as Language[]).map(l => <Pressable key={l} onPress={() => setLang(l)} style={[styles.segmentItem, lang === l && { backgroundColor: c.primary }]}><Text style={{ color: lang === l ? '#FFF' : c.muted, fontSize: 12, fontWeight: '700' }}>{l === 'fa' ? 'فا' : 'EN'}</Text></Pressable>)}
          </View>
        </View>
      </View>
      <Text style={[styles.settingSection, { color: c.muted }]}>{t.account}</Text>
      <View style={[styles.settingCard, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Pressable onPress={() => showAlert(lang === 'fa' ? 'نشست فعلی با رمز عبور محافظت می‌شود. از «خروج از همه دستگاه‌ها» برای لغو نشست‌های دیگر استفاده کن. رمز عبور را با کسی به اشتراک نگذار.' : 'Your session is password-protected. Use “Sign out all devices” to revoke other sessions. Never share your password.')} style={[styles.settingRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.settingIcon, { backgroundColor: c.soft }]}><Ionicons name="shield-checkmark-outline" size={20} color={c.primary} /></View>
          <Text style={[styles.settingLabel, { color: c.text }]}>{t.privacy}</Text>
          <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={c.muted} />
        </Pressable>
        <View style={[styles.settingRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.settingIcon, { backgroundColor: c.soft }]}><Ionicons name="notifications-outline" size={20} color={c.primary} /></View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[styles.settingLabel, { color: c.text }]}>{t.notifications}</Text>
            <Text style={{ color: c.muted, fontSize: 10, lineHeight: 15 }}>{lang === 'fa' ? 'مجوز اعلان‌های دستگاه' : 'Device notification permission'}</Text>
          </View>
          <Switch value={notificationsEnabled} onValueChange={v => { void toggleNotifications(v); }} trackColor={{ true: c.primary, false: c.border }} />
        </View>
        <Pressable onPress={() => showAlert(lang === 'fa' ? 'پیام‌رسان وطن · نسخه ۱.۰.۰\\nرابط بومی React Native · فارسی و انگلیسی\\nسرور پیام‌ها: binercraft.ir' : 'Vatan Messenger · version 1.0.0\\nNative React Native interface · Persian and English\\nMessaging API: binercraft.ir')} style={[styles.settingRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.settingIcon, { backgroundColor: c.soft }]}><Ionicons name="information-circle-outline" size={20} color={c.primary} /></View>
          <Text style={[styles.settingLabel, { color: c.text }]}>{t.about}</Text>
          <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={c.muted} />
        </Pressable>
      </View>
      <Pressable onPress={signOut} disabled={busy} style={[styles.loginButton, { borderColor: c.border }]}><Ionicons name="log-out-outline" size={19} color={c.primary} /><Text style={{ color: c.primary, fontWeight: '800' }}>{lang === 'fa' ? 'خروج از حساب' : 'Sign out'}</Text></Pressable>
      <Pressable onPress={signOutEverywhere} disabled={busy} style={[styles.loginButton, { borderColor: c.border, marginTop: 8 }]}><Ionicons name="phone-portrait-outline" size={19} color="#E34E68" /><Text style={{ color: '#E34E68', fontWeight: '800' }}>{lang === 'fa' ? 'خروج از همه دستگاه‌ها' : 'Sign out all devices'}</Text></Pressable>
      {!!saved && <Text style={{ textAlign: 'center', color: c.primary, marginTop: 12 }}>{t.saved}</Text>}
    </>
  );

  const navItems: { key: Tab; icon: any; active: any }[] = [
    { key: 'chats', icon: 'chatbubble-ellipses-outline', active: 'chatbubble-ellipses' },
    { key: 'contacts', icon: 'people-outline', active: 'people' },
    { key: 'groups', icon: 'grid-outline', active: 'grid' },
    { key: 'channels', icon: 'megaphone-outline', active: 'megaphone' },
    { key: 'saved', icon: 'bookmark-outline', active: 'bookmark' },
    { key: 'settings', icon: 'settings-outline', active: 'settings' }
  ];

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: '#F5F7FC', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 32, fontWeight: '900', color: '#5B52E8' }}>وطن</Text></View>;

  // Authentication is the app's entry point: never render the messenger before sign-in.
  if (!sessionReady) {
    return <SafeAreaView style={[styles.safe, { backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center' }]}><Text style={{ color: c.primary, fontSize: 28, fontWeight: '900' }}>وطن</Text><Text style={{ color: c.muted, marginTop: 8 }}>در حال بازیابی نشست…</Text></SafeAreaView>;
  }

  if (!apiToken) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: c.bg, justifyContent: 'center' }]} edges={['top', 'bottom', 'left', 'right']}>
        <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={c.bg} />
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 28 }} keyboardShouldPersistTaps="handled">
          <Animated.View style={{ alignItems: 'center', marginBottom: 28, opacity: heroMotion, transform: [{ translateY: heroMotion.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
            <View style={styles.authLogoGlow} />
            <View style={{ width: 88, height: 88, borderRadius: 29, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 16, shadowColor: c.primary, shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 10, borderWidth: 1, borderColor: '#FFFFFF33' }}>
              <Ionicons name="chatbubbles" size={43} color="#FFFFFF" />
            </View>
            <Text style={{ color: c.text, fontSize: 32, fontWeight: '900' }}>{lang === 'fa' ? 'وطن' : 'Vatan'}</Text>
            <Text style={{ color: c.muted, fontSize: 13, marginTop: 5, textAlign: 'center' }}>{lang === 'fa' ? 'ارتباط، نزدیک‌تر از همیشه' : 'Closer, wherever you are'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 30, backgroundColor: c.soft, borderWidth: 1, borderColor: c.border }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#23C99A' }} />
              <Text style={{ color: c.muted, fontSize: 10, fontWeight: '700' }}>{lang === 'fa' ? 'پیام‌رسان مستقل و امن' : 'Your independent messenger'}</Text>
            </View>
          </Animated.View>
          <View style={{ backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 28, padding: 20, shadowColor: c.primary, shadowOpacity: dark ? 0.16 : 0.06, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 5 }}>
            <Text style={{ color: c.text, fontSize: 22, fontWeight: '900', textAlign: isRTL ? 'right' : 'left' }}>{loginMode === 'login' ? (lang === 'fa' ? 'خوش برگشتی 👋' : 'Welcome back 👋') : (lang === 'fa' ? 'به وطن بپیوند' : 'Join Vatan')}</Text>
            <Text style={{ color: c.muted, fontSize: 12, lineHeight: 19, marginTop: 6, marginBottom: 18, textAlign: isRTL ? 'right' : 'left' }}>{lang === 'fa' ? 'برای ادامه، وارد حساب شو یا حساب جدید بساز.' : 'Sign in or create an account to continue.'}</Text>
            <View style={[styles.authModeSwitch, { backgroundColor: c.input, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {(['login', 'register'] as const).map(mode => <Pressable key={mode} onPress={() => setLoginMode(mode)} style={[styles.authModeItem, loginMode === mode && { backgroundColor: c.primary }]}>
                <Text style={{ color: loginMode === mode ? '#FFF' : c.muted, fontWeight: '800' }}>{mode === 'login' ? (lang === 'fa' ? 'ورود' : 'Sign in') : (lang === 'fa' ? 'ثبت‌نام' : 'Sign up')}</Text>
              </Pressable>)}
            </View>
            <Text style={[styles.fieldLabel, { color: c.muted }]}>{lang === 'fa' ? 'نام کاربری' : 'Username'}</Text>
            <TextInput value={loginUsername} onChangeText={v => setLoginUsername(v.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32))} autoCapitalize="none" autoCorrect={false} placeholder="vatan_user" placeholderTextColor={c.muted} returnKeyType="next" style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: 'left', paddingVertical: 14 }]} />
            {loginMode === 'register' && <>
              <Text style={[styles.fieldLabel, { color: c.muted }]}>{t.displayName}</Text>
              <TextInput value={loginDisplayName} onChangeText={setLoginDisplayName} placeholder={lang === 'fa' ? 'مثلاً کاربر وطن' : 'e.g. Vatan User'} placeholderTextColor={c.muted} maxLength={60} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: isRTL ? 'right' : 'left', paddingVertical: 14 }]} />
            </>}
            <Text style={[styles.fieldLabel, { color: c.muted }]}>{lang === 'fa' ? 'رمز عبور (حداقل ۸ نویسه)' : 'Password (8+ characters)'}</Text>
            <TextInput value={loginPassword} onChangeText={setLoginPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="••••••••" placeholderTextColor={c.muted} returnKeyType="done" onSubmitEditing={() => { void loginToApi(); }} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: 'left', paddingVertical: 14 }]} />
            <Pressable disabled={busy} onPress={() => { tapFeedback(); void loginToApi(); }} style={[styles.modalPrimary, { backgroundColor: c.primary, opacity: busy ? 0.6 : 1, marginTop: 16, borderRadius: 15, paddingVertical: 16 }]}>
              <Text style={styles.primaryButtonText}>{busy ? (lang === 'fa' ? 'لطفاً صبر کن…' : 'Please wait…') : (loginMode === 'login' ? (lang === 'fa' ? 'ورود به وطن' : 'Sign in to Vatan') : (lang === 'fa' ? 'ساخت حساب و ادامه' : 'Create account & continue'))}</Text>
            </Pressable>
            <Text style={{ color: c.muted, fontSize: 10, lineHeight: 16, marginTop: 12, textAlign: 'center' }}>{lang === 'fa' ? 'با ورود یا ثبت‌نام، وارد فضای پیام‌رسان می‌شوی.' : 'Sign in or sign up to enter the messenger.'}</Text>
          </View>
          <Pressable onPress={() => setLang(lang === 'fa' ? 'en' : 'fa')} style={{ alignSelf: 'center', padding: 14, marginTop: 8 }}>
            <Text style={{ color: c.primary, fontWeight: '800' }}>{lang === 'fa' ? 'English' : 'فارسی'}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={c.bg} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
        <Animated.View style={[styles.ambientOrb, styles.ambientOrbTop, { backgroundColor: c.primary, opacity: dark ? 0.10 : 0.045, transform: [{ scale: heroMotion.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }] }]} />
        <View style={[styles.ambientOrb, styles.ambientOrbBottom, { backgroundColor: '#19B8D4', opacity: dark ? 0.045 : 0.03 }]} />
      </View>
      <Header title={tab === 'chats' ? t.brand : labelForTab(tab)} subtitle={tab === 'chats' ? t.tagline : undefined} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: tabMotion, transform: [{ translateY: tabMotion.interpolate({ inputRange: [0, 1], outputRange: [9, 0] }) }] }}>
          {tab === 'chats' && renderHome()}
          {tab === 'contacts' && renderContacts()}
          {tab === 'groups' && renderCollection('group')}
          {tab === 'channels' && renderCollection('channel')}
          {tab === 'saved' && renderSavedMessages()}
          {tab === 'settings' && renderSettings()}
        </Animated.View>
      </ScrollView>
      <View style={[styles.bottomNav, { backgroundColor: dark ? 'rgba(14,21,38,0.88)' : 'rgba(255,255,255,0.9)', borderColor: c.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <BlurView intensity={dark ? 45 : 65} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        {navItems.map(item => {
          const active = tab === item.key;
          return <Pressable key={item.key} onPress={() => { tapFeedback(); setTab(item.key); }} style={styles.navItem} android_ripple={{ color: c.soft, borderless: false }}>
            <Animated.View style={[styles.navIconWrap, active && { backgroundColor: c.soft, borderColor: c.primary + '44', borderWidth: 1 }, active && { transform: [{ scale: tabMotion.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }] }]}>
              <Ionicons name={active ? item.active : item.icon} size={21} color={active ? c.primary : c.muted} />
            </Animated.View>
            <Text style={{ fontSize: 10, color: active ? c.primary : c.muted, fontWeight: active ? '800' : '500' }}>{labelForTab(item.key)}</Text>
          </Pressable>;
        })}
      </View>

      <Modal visible={modal !== null} transparent={modal !== 'chat'} animationType={modal === 'chat' ? 'none' : 'slide'} onRequestClose={() => setModal(null)}>
        <KeyboardAvoidingView style={[styles.modalBackdrop, modal === 'chat' && { backgroundColor: c.bg, justifyContent: 'flex-start' }]} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
          {modal !== 'chat' && <Pressable style={styles.modalDismiss} onPress={() => setModal(null)} />}
          <Animated.View style={[styles.modalSheet, { backgroundColor: c.surface }, modal === 'chat' && styles.fullChatSheet, modal === 'chat' && { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 10), transform: [{ translateX: chatTransition }] }]}>
            <View style={[styles.modalHandle, { backgroundColor: c.border }]} />
            <View style={[styles.modalHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.modalTitle, { color: c.text }]}>{modal === 'forward' ? (lang === 'fa' ? 'انتقال پیام‌ها' : 'Forward messages') : modal === 'group' ? t.newGroup : modal === 'channel' ? t.newChannel : modal === 'profile' ? t.editProfile : modal === 'userProfile' ? (lang === 'fa' ? 'اطلاعات کاربر' : 'User profile') : modal === 'groupSettings' ? (activeRoom?.kind === 'channel' ? (lang === 'fa' ? 'تنظیمات کانال' : 'Channel settings') : (lang === 'fa' ? 'تنظیمات گروه' : 'Group settings')) : modal === 'searchMessages' ? (lang === 'fa' ? 'جست‌وجوی پیام‌ها' : 'Search messages') : modal === 'chat' ? (activeRoom?.title ?? t.chats) : t.phone}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                {modal === 'chat' && <Pressable onPress={() => { setMessageSearchQuery(''); setMessageSearchResults([]); setModal('searchMessages'); }}><Ionicons name="search-outline" size={22} color={c.primary} /></Pressable>}
                {modal === 'chat' && activeRoom && activeRoom.kind !== 'direct' && <Pressable onPress={() => { void openGroupSettings(); }}><Ionicons name="settings-outline" size={22} color={c.primary} /></Pressable>}
                <Pressable onPress={() => setModal(null)}><Ionicons name="close" size={24} color={c.muted} /></Pressable>
              </View>
            </View>
            {modal === 'forward' ? <>
              <Text style={[styles.demoNote, { color: c.muted }]}>{lang === 'fa' ? `${selectedMessageIds.length} پیام انتخاب شده. پیام‌های متنی به گفت‌وگوی مقصد فرستاده می‌شوند.` : `${selectedMessageIds.length} messages selected. Text content will be sent to the destination chat.`}</Text>
              <ScrollView style={{ maxHeight: '65%' }}>
                {rooms.map(room => <Pressable key={room.id} disabled={busy} onPress={() => { void forwardSelectedMessages(room); }} style={[styles.chatRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: c.border, opacity: busy ? 0.5 : 1 }]}>
                  <Avatar icon={room.icon} color={room.kind === 'group' ? '#10B981' : room.kind === 'channel' ? '#2878E8' : c.primary} size={42} uri={room.avatarUrl} />
                  <View style={[styles.chatInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}><Text style={[styles.chatTitle, { color: c.text }]}>{room.title}</Text><Text style={[styles.chatSubtitle, { color: c.muted }]}>{room.kind === 'group' ? t.groups : room.kind === 'channel' ? t.channels : (lang === 'fa' ? 'شخصی' : 'Private')}</Text></View>
                  <Ionicons name="arrow-redo-outline" size={19} color={c.primary} />
                </Pressable>)}
              </ScrollView>
              <Pressable onPress={() => { setModal('chat'); setSelectedMessageIds([]); }} style={styles.cancelButton}><Text style={{ color: c.muted }}>{t.cancel}</Text></Pressable>
            </> : modal === 'group' || modal === 'channel' ? <>
              <Text style={[styles.fieldLabel, { color: c.muted }]}>{t.name}</Text>
              <TextInput value={roomName} onChangeText={setRoomName} placeholder={modal === 'group' ? (lang === 'fa' ? 'مثلاً دوستان' : 'e.g. Friends') : (lang === 'fa' ? 'مثلاً اخبار وطن' : 'e.g. Vatan News')} placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: isRTL ? 'right' : 'left' }]} maxLength={60} />
              <Text style={[styles.fieldLabel, { color: c.muted }]}>{t.description}</Text>
              <TextInput value={roomDescription} onChangeText={setRoomDescription} placeholder={t.description} placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: isRTL ? 'right' : 'left' }]} maxLength={180} />
              <Text style={[styles.demoNote, { color: c.muted }]}>{apiToken ? (lang === 'fa' ? 'این گفتگو روی سرور ساخته می‌شود.' : 'This conversation will be created on the server.') : (lang === 'fa' ? 'برای ساخت گفتگو باید ابتدا به API وصل شوی.' : 'Connect to the API before creating a conversation.')}</Text>
              <Pressable onPress={createRoom} style={[styles.modalPrimary, { backgroundColor: c.primary }]}><Text style={styles.primaryButtonText}>{t.create}</Text></Pressable>
            </> : modal === 'searchMessages' ? <>
              <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
                <TextInput value={messageSearchQuery} onChangeText={setMessageSearchQuery} onSubmitEditing={() => { void searchMessagesInRoom(); }} placeholder={lang === 'fa' ? 'عبارت مورد جست‌وجو…' : 'Search text…'} placeholderTextColor={c.muted} style={[styles.fieldInput, { flex: 1, color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: isRTL ? 'right' : 'left' }]} />
                <Pressable onPress={() => { void searchMessagesInRoom(); }} style={[styles.memberAddButton, { backgroundColor: c.soft }]}><Ionicons name="search" size={18} color={c.primary} /></Pressable>
              </View>
              <ScrollView style={{ maxHeight: '65%' }} keyboardShouldPersistTaps="handled">
                {messageSearchResults.map(message => <Pressable key={message.id} onPress={() => { setModal('chat'); }} style={{ paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border, gap: 4 }}>
                  <Text style={{ color: c.primary, fontSize: 11, fontWeight: '800' }}>{message.displayName} · @{message.username}</Text>
                  <Text style={{ color: c.text, fontSize: compactMessages ? 12 : 13, lineHeight: compactMessages ? 17 : 20 }}>{message.body}</Text>
                  <Text style={{ color: c.muted, fontSize: 10 }}>{message.createdAt}</Text>
                </Pressable>)}
                {messageSearchResults.length === 0 && <Text style={[styles.emptyHint, { color: c.muted }]}>{busy ? '…' : (lang === 'fa' ? 'نتیجه‌ای پیدا نشد.' : 'No results found.')}</Text>}
              </ScrollView>
              <Pressable disabled={busy || groupMembers.some(member => member.id === userId && member.role === 'owner')} onPress={() => { void leaveCurrentGroup(); }} style={[styles.cancelButton, { opacity: groupMembers.some(member => member.id === userId && member.role === 'owner') ? 0.5 : 1 }]}><Text style={{ color: '#E34E68', fontWeight: '800' }}>{lang === 'fa' ? 'خروج از گروه' : 'Leave group'}</Text></Pressable>
              <Pressable onPress={() => setModal('chat')} style={styles.cancelButton}><Text style={{ color: c.muted }}>{t.cancel}</Text></Pressable>
            </> : modal === 'groupSettings' ? <>
              <ScrollView style={{ maxHeight: '76%' }} keyboardShouldPersistTaps="handled">
                <Text style={[styles.fieldLabel, { color: c.muted }]}>{t.name}</Text>
                <TextInput value={roomName} onChangeText={setRoomName} maxLength={100} editable={canManageGroup} placeholder={t.name} placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: isRTL ? 'right' : 'left' }]} />
                <Text style={[styles.fieldLabel, { color: c.muted }]}>{t.description}</Text>
                <TextInput value={roomDescription} onChangeText={setRoomDescription} maxLength={280} editable={canManageGroup} placeholder={t.description} placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: isRTL ? 'right' : 'left' }]} />
                <Text style={[styles.fieldLabel, { color: c.muted }]}>{lang === 'fa' ? 'آدرس HTTPS عکس گروه (اختیاری)' : 'Group avatar HTTPS URL (optional)'}</Text>
                <TextInput value={groupSettings?.avatarUrl ?? ''} onChangeText={v => setGroupSettings(current => current ? { ...current, avatarUrl: v.trim() || null } : current)} editable={canManageGroup} autoCapitalize="none" placeholder="https://…" placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: 'left' }]} />
                <Text style={[styles.fieldLabel, { color: c.muted }]}>{lang === 'fa' ? 'تم گروه' : 'Group theme'}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {(['violet','blue','green','rose','amber','midnight','ocean'] as const).map((key, index) => {
                    const colors = ['#5B52E8','#2878E8','#159A73','#E34E86','#D98B16','#202B45','#008DA8'];
                    return <Pressable key={key} onPress={() => setGroupSettings(current => current ? { ...current, themeKey: key } : current)} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: colors[index], borderWidth: groupSettings?.themeKey === key ? 3 : 1, borderColor: groupSettings?.themeKey === key ? c.text : 'transparent' }}><Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>{key}</Text></Pressable>;
                  })}
                </View>
                {groupSettings && canManageGroup && <>
                  <View style={[styles.settingRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Text style={[styles.settingLabel, { color: c.text }]}>{lang === 'fa' ? 'اعضای عادی بتوانند پیام بدهند' : 'Members can send messages'}</Text>
                    <Switch value={groupSettings.memberCanSend} onValueChange={v => setGroupSettings(current => current ? { ...current, memberCanSend: v } : current)} trackColor={{ true: c.primary, false: c.border }} />
                  </View>
                  <View style={[styles.settingRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Text style={[styles.settingLabel, { color: c.text }]}>{lang === 'fa' ? 'اعضای عادی بتوانند دعوت کنند' : 'Members can invite'}</Text>
                    <Switch value={groupSettings.memberCanInvite} onValueChange={v => setGroupSettings(current => current ? { ...current, memberCanInvite: v } : current)} trackColor={{ true: c.primary, false: c.border }} />
                  </View>
                  <Text style={[styles.fieldLabel, { color: c.muted }]}>{lang === 'fa' ? 'حالت آهسته (ثانیه؛ صفر یعنی خاموش)' : 'Slow mode (seconds; 0 disables)'}</Text>
                  <TextInput value={String(groupSettings.slowModeSeconds)} onChangeText={v => setGroupSettings(current => current ? { ...current, slowModeSeconds: Math.max(0, Math.min(3600, Number.parseInt(v || '0', 10) || 0)) } : current)} keyboardType="number-pad" placeholder="0" placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border }]} />
                </>}
                <Text style={[styles.fieldLabel, { color: c.muted, marginTop: 18 }]}>{lang === 'fa' ? 'اعضای گروه' : 'Group members'}</Text>
                <TextInput value={memberSearchQuery} onChangeText={setMemberSearchQuery} placeholder={lang === 'fa' ? 'جست‌وجوی عضو' : 'Search members'} placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: isRTL ? 'right' : 'left' }]} />
                {groupMembers.filter(member => (member.displayName + member.username).toLowerCase().includes(memberSearchQuery.toLowerCase())).map(member => {
                  const currentRole = groupMembers.find(item => item.id === userId)?.role;
                  const canManage = currentRole === 'owner' || currentRole === 'admin';
                  return <View key={member.id} style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }}>
                    <Avatar icon="person" color={c.primary} size={38} uri={member.avatarUrl} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontWeight: '800', fontSize: 12 }}>{member.displayName}</Text>
                      <Text style={{ color: c.muted, fontSize: 10 }}>@{member.username} · {member.role}</Text>
                    </View>
                    {currentRole === 'owner' && member.id !== userId && member.role !== 'owner' && <>
                      <Pressable onPress={() => { void actOnMember(member, member.role === 'admin' ? 'demote' : 'promote'); }} style={{ padding: 6 }}><Ionicons name={member.role === 'admin' ? 'shield-half-outline' : 'shield-checkmark-outline'} size={18} color={c.primary} /></Pressable>
                      <Pressable onPress={() => { void actOnMember(member, 'transfer'); }} style={{ padding: 6 }}><Ionicons name="key-outline" size={18} color={c.primary} /></Pressable>
                    </>}
                    {canManage && member.id !== userId && member.role !== 'owner' && <Pressable onPress={() => { void actOnMember(member, 'remove'); }} style={{ padding: 6 }}><Ionicons name="person-remove-outline" size={18} color="#E34E68" /></Pressable>}
                  </View>;
                })}
              </ScrollView>
              {canManageGroup && <Pressable disabled={busy} onPress={() => { void saveGroupSettings(); }} style={[styles.modalPrimary, { backgroundColor: c.primary, opacity: busy ? 0.6 : 1 }]}><Text style={styles.primaryButtonText}>{busy ? '…' : t.save}</Text></Pressable>}
              {groupMembers.some(member => member.id === userId && member.role === 'owner') && <Pressable disabled={busy} onPress={deleteCurrentGroup} style={[styles.cancelButton, { borderWidth: 1, borderColor: '#E34E68', marginTop: 8, opacity: busy ? 0.6 : 1 }]}><Text style={{ color: '#E34E68', fontWeight: '800' }}>{lang === 'fa' ? 'حذف دائمی گروه' : 'Delete group permanently'}</Text></Pressable>}
              <Pressable onPress={() => setModal('chat')} style={styles.cancelButton}><Text style={{ color: c.muted }}>{t.cancel}</Text></Pressable>
            </> : modal === 'profile' ? <>
              <Pressable onPress={pickPhoto} style={{ alignItems: 'center', marginBottom: 18 }}>
                <Avatar icon="camera" color={c.primary} size={82} uri={photo} />
                <Text style={{ color: c.primary, fontWeight: '800', marginTop: 8 }}>{t.choosePhoto}</Text>
              </Pressable>
              <Text style={[styles.fieldLabel, { color: c.muted }]}>{t.displayName}</Text>
              <TextInput value={displayName} onChangeText={setDisplayName} placeholder={t.displayName} placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: isRTL ? 'right' : 'left' }]} maxLength={40} />
              <Text style={[styles.fieldLabel, { color: c.muted }]}>{t.username}</Text>
              <TextInput value={username} onChangeText={v => setUsername(v.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24))} autoCapitalize="none" placeholder="username" placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: 'left' }]} />
              <Text style={[styles.fieldLabel, { color: c.muted }]}>{lang === 'fa' ? 'وب‌سایت (اختیاری)' : 'Website (optional)'}</Text>
              <TextInput value={websiteUrl} onChangeText={setWebsiteUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://example.com" placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: 'left' }]} maxLength={255} />
              <Text style={[styles.fieldLabel, { color: c.muted }]}>Instagram</Text>
              <TextInput value={instagramUrl} onChangeText={setInstagramUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://instagram.com/username" placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: 'left' }]} maxLength={255} />
              <Text style={[styles.fieldLabel, { color: c.muted }]}>Telegram</Text>
              <TextInput value={telegramUrl} onChangeText={setTelegramUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://t.me/username" placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: 'left' }]} maxLength={255} />
              <Text style={[styles.fieldLabel, { color: c.muted }]}>YouTube</Text>
              <TextInput value={youtubeUrl} onChangeText={setYoutubeUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://youtube.com/@username" placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: 'left' }]} maxLength={255} />
              <Text style={[styles.fieldLabel, { color: c.muted }]}>{t.birthday}</Text>
              <TextInput value={birthYear} onChangeText={v => setBirthYear(v.replace(/[^0-9]/g, '').slice(0, 4))} keyboardType="number-pad" placeholder={calendar === 'solar' ? 'مثلاً ۱۳۹۰' : 'مثلاً 2011'} placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: isRTL ? 'right' : 'left' }]} />
              <Text style={[styles.fieldLabel, { color: c.muted }]}>{t.calendar}</Text>
              <View style={[styles.segment, { backgroundColor: c.input, alignSelf: 'stretch', flexDirection: isRTL ? 'row-reverse' : 'row', marginBottom: 14 }]}>
                {(['solar', 'gregorian'] as const).map(v => <Pressable key={v} onPress={() => setCalendar(v)} style={[styles.calendarOption, calendar === v && { backgroundColor: c.primary }]}><Text style={{ color: calendar === v ? '#FFF' : c.muted, fontWeight: '700' }}>{v === 'solar' ? t.solar : t.gregorian}</Text></Pressable>)}
              </View>
              <Pressable disabled={busy} onPress={() => { void saveProfile(); }} style={[styles.modalPrimary, { backgroundColor: c.primary, opacity: busy ? 0.6 : 1 }]}><Text style={styles.primaryButtonText}>{busy ? '…' : t.save}</Text></Pressable>
              <Text style={[styles.demoNote, { color: c.muted }]}>{t.privateNote}</Text>
            </> : modal === 'userProfile' ? <>
              <ScrollView style={{ maxHeight: '78%' }} contentContainerStyle={{ alignItems: 'center', paddingVertical: 12, gap: 10 }} keyboardShouldPersistTaps="handled">
                <Avatar icon="person" color={c.primary} size={94} uri={selectedProfile?.avatarUrl ?? null} />
                <Text style={{ color: c.text, fontSize: 22, fontWeight: '900' }}>{selectedProfile?.displayName || selectedProfile?.username || (lang === 'fa' ? 'کاربر' : 'User')}</Text>
                {!!selectedProfile?.username && <Text style={{ color: c.primary, fontSize: 13, fontWeight: '700' }}>@{selectedProfile.username}</Text>}
                {profileLoading && <Text style={{ color: c.muted, fontSize: 11 }}>{lang === 'fa' ? 'در حال دریافت اطلاعات…' : 'Loading profile…'}</Text>}
                {!!selectedProfile?.birthYear && <Text style={{ color: c.muted, fontSize: 12 }}>{lang === 'fa' ? 'سال تولد: ' : 'Birth year: '}{selectedProfile.birthYear}</Text>}
                {([
                  { label: 'Website', url: selectedProfile?.websiteUrl, icon: 'globe-outline' },
                  { label: 'Instagram', url: selectedProfile?.instagramUrl, icon: 'logo-instagram' },
                  { label: 'Telegram', url: selectedProfile?.telegramUrl, icon: 'paper-plane-outline' },
                  { label: 'YouTube', url: selectedProfile?.youtubeUrl, icon: 'logo-youtube' }
                ] as const).filter(item => !!item.url).map(item => <Pressable key={item.label} onPress={() => { const url = item.url; if (url && /^https:\/\//i.test(url)) void Linking.openURL(url).catch(() => showAlert(lang === 'fa' ? 'باز کردن پیوند ممکن نشد.' : 'Could not open link.')); }} style={{ width: '100%', flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 14, backgroundColor: c.input, borderWidth: 1, borderColor: c.border }}>
                    <Ionicons name={item.icon as any} size={19} color={c.primary} />
                    <Text style={{ flex: 1, color: c.text, textAlign: isRTL ? 'right' : 'left' }}>{item.label}</Text>
                    <Ionicons name="open-outline" size={16} color={c.muted} />
                  </Pressable>)}
                {!profileLoading && !selectedProfile?.websiteUrl && !selectedProfile?.instagramUrl && !selectedProfile?.telegramUrl && !selectedProfile?.youtubeUrl && <Text style={{ color: c.muted, fontSize: 12, marginTop: 8 }}>{lang === 'fa' ? 'این کاربر پیوند عمومی ثبت نکرده است.' : 'This user has not added public links.'}</Text>}
                <Pressable onPress={() => { if (selectedProfile) void startDirectChat(selectedProfile); }} style={[styles.modalPrimary, { backgroundColor: c.primary, width: '100%', marginTop: 8 }]}><Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFF" /><Text style={styles.primaryButtonText}>{lang === 'fa' ? 'ارسال پیام' : 'Message'}</Text></Pressable>
              </ScrollView>
              <Pressable onPress={() => setModal(null)} style={styles.cancelButton}><Text style={{ color: c.muted }}>{t.cancel}</Text></Pressable>
            </> : modal === 'chat' ? <>
              {selectedMessageIds.length > 0 && <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: 14, backgroundColor: c.soft, marginTop: 6 }}>
                <Text style={{ color: c.primary, fontSize: 11, fontWeight: '900' }}>{selectedMessageIds.length} {lang === 'fa' ? 'پیام انتخاب شده' : 'selected'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Pressable onPress={() => setModal('forward')}><Ionicons name="arrow-redo-outline" size={20} color={c.primary} /></Pressable>
                  <Pressable onPress={() => setSelectedMessageIds([])}><Ionicons name="close-circle-outline" size={20} color={c.muted} /></Pressable>
                </View>
              </View>}
              <ScrollView style={styles.fullChatMessages} contentContainerStyle={{ gap: 12, paddingVertical: 14 }} keyboardShouldPersistTaps="handled">
                {messages.length === 0 ? <Text style={[styles.demoNote, { color: c.muted, textAlign: 'center' }]}>{lang === 'fa' ? 'هنوز پیامی وجود ندارد. اولین پیام را بفرست.' : 'No messages yet. Send the first message.'}</Text> : messages.map(message => {
                  const mine = message.senderId === userId;
                  const reactions = messageReactions[message.id] ?? [];
                  return <View key={message.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '96%', flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: compactMessages ? 4 : 7 }}>
                    <Avatar icon="person" color={mine ? c.primary : '#159A73'} size={compactMessages ? 24 : 30} uri={message.avatarUrl ?? null} />
                    <View style={{ maxWidth: '88%' }}>
                      <Pressable onPress={() => { void openUserProfile({ id: message.senderId, username: message.username, displayName: message.displayName || message.username, avatarUrl: message.avatarUrl ?? null }); }} hitSlop={5} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', marginBottom: 3 }}><Text style={{ color: c.primary, fontSize: 10, fontWeight: '800', textAlign: mine ? 'right' : 'left' }}>{message.displayName || message.username}{message.username ? ' · @' + message.username : ''}{message.username?.toLowerCase() === 'hirad990' && <Ionicons name="checkmark-circle" size={12} color="#2997FF" />}</Text></Pressable>
                      <View style={{ backgroundColor: mine ? (activeRoom?.kind === 'group' ? groupAccent + '22' : c.soft) : c.input, borderRadius: compactMessages ? 12 : 14, paddingHorizontal: compactMessages ? 10 : 12, paddingVertical: compactMessages ? 6 : 9, borderWidth: activeRoom?.kind === 'group' ? 1 : 0, borderColor: activeRoom?.kind === 'group' ? groupAccent + '55' : 'transparent' }}>
                        {!!message.replyToId && <Text style={{ color: c.muted, fontSize: 10, marginBottom: 4 }}>↪ {lang === 'fa' ? 'در پاسخ به پیام' : 'Replying to a message'}</Text>}
                        <Text style={{ color: c.text, fontSize: 13 }}>{message.body}</Text>
                        {(message.attachments ?? []).map(file => <Pressable key={file.id} onPress={() => { void (file.mimeType.startsWith('audio/') ? playVoiceAttachment(file.url, file.name) : openAttachment(file.url, file.name)); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, padding: 8, borderRadius: 10, backgroundColor: c.surface, marginTop: 7 }}>
                          {file.mimeType.startsWith('image/') ? <Pressable onPress={() => setImageViewerUri(file.url)}><Image source={{ uri: file.url, headers: apiToken ? { Authorization: `Bearer ${apiToken}` } : undefined }} style={{ width: 76, height: 76, borderRadius: 10 }} resizeMode="cover" /></Pressable> : <Ionicons name={file.mimeType.startsWith('video/') ? 'videocam-outline' : file.mimeType.startsWith('audio/') ? 'play-circle-outline' : 'document-outline'} size={22} color={c.primary} />}
                          <View style={{ flex: 1 }}><Text style={{ color: c.text, fontSize: 11 }} numberOfLines={1}>{file.name}</Text><Text style={{ color: c.muted, fontSize: 9 }}>{Math.max(1, Math.round(file.sizeBytes / 1024))} KB</Text></View>
                          <Ionicons name="download-outline" size={17} color={c.primary} />
                        </Pressable>)}
                        <Text style={{ color: c.muted, fontSize: 9, marginTop: 4 }}>{message.createdAt}{message.editedAt ? (lang === 'fa' ? ' · ویرایش‌شده' : ' · edited') : ''}{message.status === 'sending' ? (lang === 'fa' ? ' · در حال ارسال…' : ' · sending…') : message.status === 'failed' ? (lang === 'fa' ? ' · ارسال ناموفق' : ' · failed') : mine && (message.readCount ?? 0) > 0 ? (lang === 'fa' ? ' · خوانده شد' : ' · read') : mine && message.status === 'sent' ? (lang === 'fa' ? ' · ارسال شد' : ' · sent') : ''}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        {(['👍','❤️','😂','🔥'] as const).map(emoji => {
                          const count = reactions.find(item => item.reaction === emoji)?.count ?? 0;
                          return <Pressable key={emoji} onPress={() => { void reactToMessage(message, emoji); }} style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 }}><Text style={{ fontSize: 10, color: c.text }}>{emoji}{count ? ' ' + count : ''}</Text></Pressable>;
                        })}
                        {!message.id.startsWith('local-') && <Pressable onPress={() => setSelectedMessageIds(previous => previous.includes(message.id) ? previous.filter(id => id !== message.id) : [...previous, message.id])} style={{ paddingHorizontal: 4, paddingVertical: 3 }} accessibilityRole="button" accessibilityLabel={selectedMessageIds.includes(message.id) ? (lang === 'fa' ? 'لغو انتخاب پیام' : 'Unselect message') : (lang === 'fa' ? 'انتخاب برای انتقال' : 'Select to forward')}><Ionicons name={selectedMessageIds.includes(message.id) ? 'checkbox' : 'square-outline'} size={15} color={selectedMessageIds.includes(message.id) ? c.primary : c.muted} /></Pressable>}
                        <Pressable onPress={() => toggleSavedMessage(message)} style={{ paddingHorizontal: 4, paddingVertical: 3 }} accessibilityRole="button" accessibilityLabel={savedMessages.some(item => item.id === message.id && item.conversationId === message.conversationId) ? (lang === 'fa' ? 'حذف از پیام‌های ذخیره‌شده' : 'Remove saved message') : (lang === 'fa' ? 'ذخیره پیام' : 'Save message')}><Ionicons name={savedMessages.some(item => item.id === message.id && item.conversationId === message.conversationId) ? 'bookmark' : 'bookmark-outline'} size={15} color={savedMessages.some(item => item.id === message.id && item.conversationId === message.conversationId) ? c.primary : c.muted} /></Pressable>
                        <Pressable onPress={() => { setReplyingTo(message); setEditingMessageId(null); }} style={{ paddingHorizontal: 4, paddingVertical: 3 }}><Ionicons name="return-up-back-outline" size={15} color={c.muted} /></Pressable>
                        {mine && !message.id.startsWith('local-') && <Pressable onPress={() => { setEditingMessageId(message.id); setReplyingTo(null); setMessageDraft(message.body); }} style={{ paddingHorizontal: 4, paddingVertical: 3 }}><Ionicons name="create-outline" size={15} color={c.muted} /></Pressable>}
                        {(mine || groupMembers.some(member => member.id === userId && ['owner','admin'].includes(member.role))) && !message.id.startsWith('local-') && <Pressable onPress={() => { void removeMessage(message); }} style={{ paddingHorizontal: 4, paddingVertical: 3 }}><Ionicons name="trash-outline" size={15} color="#E34E68" /></Pressable>}
                        {message.status === 'failed' && <Pressable onPress={() => { void retryMessage(message); }} style={{ paddingHorizontal: 4, paddingVertical: 3 }}><Ionicons name="refresh" size={15} color="#E34E68" /></Pressable>}
                      </View>
                    </View>
                  </View>;
                })}
              </ScrollView>
              {activeRoom?.kind === 'group' && <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <TextInput value={memberUsername} onChangeText={setMemberUsername} autoCapitalize="none" placeholder={lang === 'fa' ? 'افزودن با نام کاربری' : 'Add member by username'} placeholderTextColor={c.muted} style={[styles.fieldInput, { flex: 1, color: c.text, backgroundColor: c.input, borderColor: c.border, marginBottom: 0 }]} />
                <Pressable disabled={busy || !memberUsername.trim()} onPress={() => { void inviteMember(); }} style={[styles.memberAddButton, { backgroundColor: c.soft }]}><Ionicons name="person-add" size={18} color={c.primary} /></Pressable>
              </View>}
              {!!(replyingTo || editingMessageId) && <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', padding: 8, backgroundColor: c.soft, borderRadius: 10, marginTop: 6 }}>
                <Text style={{ color: c.primary, fontSize: 11, flex: 1 }}>{editingMessageId ? (lang === 'fa' ? 'ویرایش پیام' : 'Editing message') : (lang === 'fa' ? 'پاسخ به: ' + (replyingTo?.displayName ?? '') : 'Reply to: ' + (replyingTo?.displayName ?? ''))}</Text>
                <Pressable onPress={() => { setReplyingTo(null); setEditingMessageId(null); setMessageDraft(''); }}><Ionicons name="close-circle" size={18} color={c.muted} /></Pressable>
              </View>}
              <Animated.View style={{ transform: [{ translateY: composerLift.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] }}>
              <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <Pressable disabled={busy} onPress={() => { void pickMediaForChat(); }} style={{ padding: 8, borderRadius: 12, backgroundColor: c.soft }}><Ionicons name="image-outline" size={20} color={c.primary} /></Pressable>
                <Pressable disabled={busy} onPress={() => { void toggleVoiceRecording(); }} style={{ padding: 8, borderRadius: 12, backgroundColor: voiceRecording ? '#E34E6830' : c.soft }} accessibilityRole="button" accessibilityLabel={voiceRecording ? (lang === 'fa' ? 'توقف و ارسال ویس' : 'Stop and send voice note') : (lang === 'fa' ? 'ضبط ویس' : 'Record voice note')}><Ionicons name={voiceRecording ? 'stop-circle' : 'mic-outline'} size={20} color={voiceRecording ? '#E34E68' : c.primary} /></Pressable>
                <Pressable disabled={busy} onPress={() => { void pickDocumentForChat(); }} style={{ padding: 8, borderRadius: 12, backgroundColor: c.soft }}><Ionicons name="attach-outline" size={20} color={c.primary} /></Pressable>
                <View style={{ flex: 1 }}>
                  {!!voiceRecording && <Text style={{ color: '#E34E68', fontSize: 10, marginBottom: 3, textAlign: isRTL ? 'right' : 'left' }}>{lang === 'fa' ? 'در حال ضبط ویس… برای ارسال دوباره روی توقف بزن' : 'Recording voice… tap stop to send'}</Text>}
                  {!!messageDraft.trim() && !editingMessageId && <Text style={{ color: c.muted, fontSize: 9, marginBottom: 3, textAlign: isRTL ? 'right' : 'left' }}>{lang === 'fa' ? 'پیش‌نویس به‌صورت خودکار ذخیره می‌شود' : 'Draft saved automatically'}</Text>}
                  <TextInput value={messageDraft} onChangeText={setMessageDraft} returnKeyType="send" blurOnSubmit={true} onSubmitEditing={() => { void submitMessage(); }} placeholder={editingMessageId ? (lang === 'fa' ? 'متن ویرایش‌شده…' : 'Edit message…') : (lang === 'fa' ? 'پیامت را بنویس…' : 'Write a message…')} placeholderTextColor={c.muted} multiline style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: isRTL ? 'right' : 'left', maxHeight: 90, marginBottom: 0 }]} />
                </View>
                <Pressable disabled={!messageDraft.trim()} onPress={() => { void submitMessage(); }} style={[styles.modalPrimary, { backgroundColor: c.primary, paddingHorizontal: 16, opacity: !messageDraft.trim() ? 0.55 : 1 }]}><Ionicons name={editingMessageId ? 'checkmark' : 'send'} size={18} color="#FFF" /></Pressable>
              </View>
              </Animated.View>
            </> : <>
              <View style={[styles.authModeSwitch, { backgroundColor: c.input, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                {(['login', 'register'] as const).map(mode => <Pressable key={mode} onPress={() => setLoginMode(mode)} style={[styles.authModeItem, loginMode === mode && { backgroundColor: c.primary }]}><Text style={{ color: loginMode === mode ? '#FFF' : c.muted, fontWeight: '800' }}>{mode === 'login' ? (lang === 'fa' ? 'ورود' : 'Sign in') : (lang === 'fa' ? 'ثبت‌نام' : 'Sign up')}</Text></Pressable>)}
              </View>
              <Text style={[styles.fieldLabel, { color: c.muted }]}>{t.phoneHint}</Text>
              <TextInput value={loginUsername} onChangeText={v => setLoginUsername(v.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32))} autoCapitalize="none" autoCorrect={false} placeholder="vatan_user" placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: 'left' }]} />
              {loginMode === 'register' && <><Text style={[styles.fieldLabel, { color: c.muted }]}>{t.displayName}</Text>
              <TextInput value={loginDisplayName} onChangeText={setLoginDisplayName} placeholder={lang === 'fa' ? 'مثلاً کاربر وطن' : 'e.g. Vatan User'} placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: isRTL ? 'right' : 'left' }]} maxLength={60} /></>}
              <Text style={[styles.fieldLabel, { color: c.muted }]}>{lang === 'fa' ? 'رمز عبور (حداقل ۸ نویسه)' : 'Password (8+ characters)'}</Text>
              <TextInput value={loginPassword} onChangeText={setLoginPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="••••••••" placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: 'left' }]} onSubmitEditing={() => { void loginToApi(); }} />
              <Text style={[styles.demoNote, { color: c.muted }]}>{t.backend}</Text>
              <Pressable disabled={busy} onPress={() => { void loginToApi(); }} style={[styles.modalPrimary, { backgroundColor: c.primary, opacity: busy ? 0.6 : 1 }]}><Text style={styles.primaryButtonText}>{busy ? '…' : (loginMode === 'login' ? (lang === 'fa' ? 'ورود به حساب' : 'Sign in') : (lang === 'fa' ? 'ساخت حساب' : 'Create account'))}</Text></Pressable>
            </>}
            <Pressable onPress={() => setModal(null)} style={styles.cancelButton}><Text style={{ color: c.muted, fontWeight: '700' }}>{t.cancel}</Text></Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={!!imageViewerUri} transparent animationType="fade" onRequestClose={() => setImageViewerUri(null)}>
        <Pressable onPress={() => setImageViewerUri(null)} style={{ flex: 1, backgroundColor: '#000000F2', alignItems: 'center', justifyContent: 'center' }}>
          <Pressable onPress={() => setImageViewerUri(null)} style={{ position: 'absolute', top: Math.max(insets.top, 18), right: 20, zIndex: 2, width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF22', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
          {!!imageViewerUri && <Image source={{ uri: imageViewerUri, headers: apiToken ? { Authorization: `Bearer ${apiToken}` } : undefined }} resizeMode="contain" style={{ width: '100%', height: '82%' }} />}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

export default function App() {
  return <SafeAreaProvider><AppContent /></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  inboxIntro: { alignItems: 'center', gap: 14, paddingTop: 4, paddingBottom: 18 },
  inboxEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginBottom: 5 },
  inboxTitle: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  inboxSubtitle: { fontSize: 11, marginTop: 4, lineHeight: 17 },
  newChatFab: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center', shadowColor: '#5B52E8', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  inboxSearch: { marginBottom: 12, borderRadius: 17, height: 48 },
  inboxFilter: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  filterCount: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  inboxSectionTitle: { fontSize: 14, fontWeight: '900' },
  pinnedTile: { width: 116, minHeight: 112, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 12 },
  smallAction: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8 },
  inboxList: { borderRadius: 22, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
  emptyIllustration: { width: 60, height: 60, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  inboxHint: { textAlign: 'center', fontSize: 10, lineHeight: 16, marginTop: 10, marginBottom: 4 },
  bottomNav: { minHeight: 72, marginHorizontal: 8, marginTop: 4, marginBottom: Platform.OS === 'ios' ? 4 : 2, paddingTop: 6, paddingBottom: 6, paddingHorizontal: 3, borderWidth: 1, borderRadius: 23, alignItems: 'center', justifyContent: 'space-around', overflow: 'hidden', shadowColor: '#000000', shadowOpacity: 0.13, shadowRadius: 22, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  navItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 2, paddingVertical: 2, borderRadius: 15 },
  navIconWrap: { width: 38, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  ambientOrb: { position: 'absolute', width: 160, height: 160, borderRadius: 80 },
  ambientOrbTop: { top: 52, right: -76 },
  ambientOrbBottom: { bottom: 80, left: -96 },
  authLogoGlow: { position: 'absolute', width: 132, height: 132, borderRadius: 66, backgroundColor: '#8B7CFF', opacity: 0.12, top: -22 },
  fullChatSheet: { flex: 1, width: '100%', maxHeight: '100%', height: '100%', minHeight: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingHorizontal: 12 },
  fullChatMessages: { flex: 1, minHeight: 0, maxHeight: undefined },
  memberAddButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  authModeSwitch: { borderRadius: 14, padding: 4, gap: 4, marginBottom: 10 },
  authModeItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 10 },
  headerShell: { marginHorizontal: 12, marginTop: 4, marginBottom: 10, borderWidth: 1, borderRadius: 23, overflow: 'hidden', shadowColor: '#000000', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  header: { paddingHorizontal: 13, paddingTop: 10, paddingBottom: 10, alignItems: 'center', gap: 11 },
  headerBrandMark: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', shadowColor: '#635BEE', shadowOpacity: 0.24, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  brandSmall: { fontSize: 21, fontWeight: '900', letterSpacing: -0.4 },
  headerSub: { fontSize: 11, marginTop: 2 },
  avatarButton: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarSmall: { width: 42, height: 42 },
  scrollContent: { paddingHorizontal: 14, paddingBottom: 16, flexGrow: 1 },
  hero: { borderRadius: 26, padding: 20, marginBottom: 18, overflow: 'hidden' },
  heroGlow: { position: 'absolute', width: 140, height: 140, borderRadius: 70, opacity: 0.10, top: -48, right: -28 },
  heroEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 12 },
  heroTitle: { fontSize: 23, fontWeight: '900', letterSpacing: -0.4 },
  heroSubtitle: { fontSize: 12, marginTop: 7, lineHeight: 18 },
  heroButtons: { gap: 8, marginTop: 18, flexWrap: 'wrap' },
  primaryButton: { borderRadius: 14, paddingHorizontal: 13, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryButtonText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  secondaryButton: { borderRadius: 14, paddingHorizontal: 13, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryButtonText: { fontWeight: '800', fontSize: 12 },
  searchBox: { borderWidth: 1, borderRadius: 16, height: 50, alignItems: 'center', paddingHorizontal: 14, gap: 10, marginBottom: 24 },
  searchInput: { flex: 1, fontSize: 12 },
  sectionRow: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '900' },
  listCard: { borderRadius: 22, paddingHorizontal: 14, overflow: 'hidden' },
  chatRow: { alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  chatInfo: { flex: 1, gap: 6 },
  chatTitle: { fontSize: 13, fontWeight: '800' },
  chatSubtitle: { fontSize: 11, maxWidth: '100%' },
  unread: { backgroundColor: '#5B52E8', minWidth: 19, height: 19, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  unreadText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  infoStrip: { marginTop: 18, padding: 15, borderRadius: 18, borderWidth: 1, alignItems: 'center', gap: 12 },
  infoTitle: { fontSize: 12, fontWeight: '900', marginBottom: 4 },
  infoText: { fontSize: 10, lineHeight: 16 },
  collectionHero: { padding: 22, borderRadius: 24, marginTop: 4 },
  pageTitle: { fontSize: 23, fontWeight: '900', marginTop: 14 },
  pageSubtitle: { fontSize: 12, lineHeight: 19, marginTop: 7 },
  emptyHint: { textAlign: 'center', padding: 22, fontSize: 12 },
  profileCard: { borderWidth: 1, borderRadius: 22, padding: 16, alignItems: 'center', gap: 13, marginTop: 2 },
  profileCardInfo: { flex: 1, gap: 5 },
  profileName: { fontSize: 18, fontWeight: '900' },
  settingSection: { fontSize: 12, fontWeight: '900', marginTop: 24, marginBottom: 10, marginHorizontal: 4 },
  settingCard: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14 },
  settingRow: { minHeight: 66, alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#8892A022' },
  settingIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { flex: 1, fontSize: 13, fontWeight: '700' },
  segment: { borderRadius: 12, padding: 3, flexDirection: 'row', gap: 3 },
  segmentItem: { minWidth: 37, height: 31, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  calendarOption: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  loginButton: { marginTop: 22, borderRadius: 15, borderWidth: 1, padding: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#080B18A8' },
  modalDismiss: { flex: 1 },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 16, maxHeight: '92%', width: '100%', alignSelf: 'center' },
  modalHandle: { width: 42, height: 4, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
  modalHeader: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle: { fontSize: 20, fontWeight: '900' },
  fieldLabel: { fontSize: 12, fontWeight: '800', marginBottom: 7, marginTop: 8 },
  fieldInput: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14, marginBottom: 6 },
  demoNote: { fontSize: 11, lineHeight: 17, marginTop: 8, marginBottom: 10 },
  modalPrimary: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  cancelButton: { alignItems: 'center', padding: 13, marginTop: 4 }
});