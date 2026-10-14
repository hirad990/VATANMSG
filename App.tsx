import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, I18nManager, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text as NativeText, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Vazirmatn_400Regular, Vazirmatn_500Medium, Vazirmatn_600SemiBold, Vazirmatn_700Bold, Vazirmatn_800ExtraBold, Vazirmatn_900Black } from '@expo-google-fonts/vazirmatn';
import { addConversationMember, createChannel, createDirectConversation, createGroup, getConversationMembers, getConversationSettings, getMessages, getMyProfile, listConversations, loginWithPassword, logout as logoutFromApi, registerAccount, removeConversationMember, searchUsers, sendMessage, setConversationMemberRole, transferConversationOwnership, updateConversationSettings, updateMyProfile, type VatanGroupSettings, type VatanMember, type VatanMessage, type VatanUser } from './src/services/api';
import { BlurView } from 'expo-blur';


const SESSION_KEY = 'vatanmsg.session.v1';

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
type Tab = 'chats' | 'contacts' | 'groups' | 'channels' | 'settings';
type Room = { id: string; title: string; subtitle: string; icon: string; kind: 'group' | 'channel' | 'direct' };

const COPY = {
  fa: {
    brand: 'وطن', tagline: 'ارتباط، نزدیک‌تر از همیشه', search: 'جست‌وجوی پیام‌ها و افراد',
    chats: 'گفت‌وگوها', contacts: 'مخاطبین', groups: 'گروه‌ها', channels: 'کانال‌ها', settings: 'تنظیمات',
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
    chats: 'Chats', contacts: 'Contacts', groups: 'Groups', channels: 'Channels', settings: 'Settings',
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
  const [fontsLoaded] = useFonts({ Vazirmatn_400Regular, Vazirmatn_500Medium, Vazirmatn_600SemiBold, Vazirmatn_700Bold, Vazirmatn_800ExtraBold, Vazirmatn_900Black });
  const heroMotion = useRef(new Animated.Value(0)).current;
  const tabMotion = useRef(new Animated.Value(1)).current;
  const [lang, setLang] = useState<Language>('fa');
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [tab, setTab] = useState<Tab>('chats');
  const [displayName, setDisplayName] = useState('هیراد');
  const [username, setUsername] = useState('hirad');
  const [birthYear, setBirthYear] = useState('');
  const [calendar, setCalendar] = useState<'solar' | 'gregorian'>('solar');
  const [photo, setPhoto] = useState<string | null>(null);
  const [modal, setModal] = useState<'group' | 'channel' | 'profile' | 'login' | 'chat' | 'groupSettings' | null>(null);
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
  const [groupMembers, setGroupMembers] = useState<VatanMember[]>([]);
  const [groupSettings, setGroupSettings] = useState<VatanGroupSettings | null>(null);
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<VatanMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const t = COPY[lang];
  const dark = theme === 'dark';
  const c = dark ? {
    bg: '#0B1020', surface: '#131B2E', card: '#182238', text: '#F2F5FC', muted: '#96A3BB',
    border: '#27344D', primary: '#8B83FF', soft: '#25254A', input: '#10182A'
  } : {
    bg: '#F5F7FC', surface: '#FFFFFF', card: '#FFFFFF', text: '#172033', muted: '#7D879A',
    border: '#E7EAF2', primary: '#5B52E8', soft: '#EFEEFF', input: '#F6F7FB'
  };
  const isRTL = lang === 'fa';

  useEffect(() => {
    Animated.timing(heroMotion, { toValue: 1, duration: 900, useNativeDriver: true }).start();
  }, [heroMotion]);

  useEffect(() => {
    tabMotion.setValue(0);
    Animated.spring(tabMotion, { toValue: 1, useNativeDriver: true, damping: 22, stiffness: 220, mass: 0.7 }).start();
  }, [tab, tabMotion]);

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
          kind: item.kind
        })));
      } catch {
        // Preserve the current list during temporary network interruptions.
      }
    };
    const timer = setInterval(() => { void refreshConversations(); }, 8000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [apiToken, lang]);
  const filteredChats = useMemo(() => rooms.filter(x => (x.title + x.subtitle).toLowerCase().includes(search.toLowerCase())), [rooms, search]);

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
      kind: item.kind
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
        setBirthYear(user.birthYear == null ? '' : String(user.birthYear));
        setCalendar(user.birthCalendar === 'gregorian' ? 'gregorian' : 'solar');
        setRooms(conversations.conversations.map(item => ({
          id: item.id,
          title: item.title,
          subtitle: item.lastMessage || item.description || (lang === 'fa' ? 'گفت‌وگوی وطن' : 'Vatan conversation'),
          icon: item.kind === 'channel' ? 'megaphone' : item.kind === 'direct' ? 'person' : 'people',
          kind: item.kind
        })));
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
      setBirthYear(result.user.birthYear == null ? '' : String(result.user.birthYear));
      setCalendar(result.user.birthCalendar === 'gregorian' ? 'gregorian' : 'solar');
      await loadConversations(result.token);
      setModal(null);
      setLoginPassword('');
      showAlert(lang === 'fa' ? 'با موفقیت وارد وطن شدی.' : 'You are signed in to Vatan.');
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'API sign-in failed.');
    } finally {
      setBusy(false);
    }
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
        kind: conversation.kind
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
      const user = await updateMyProfile(apiToken, {
        displayName: displayName.trim(),
        username: username.trim(),
        birthYear: parsedYear,
        birthCalendar: calendar === 'solar' ? 'solar_hijri' : 'gregorian'
      });
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
      const room: Room = { id: conversation.id, title: conversation.title || person.displayName, subtitle: '@' + person.username, icon: 'person', kind: 'direct' };
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

  const openGroupSettings = async () => {
    if (!apiToken || !activeRoom || activeRoom.kind !== 'group') return;
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

  const saveGroupSettings = async () => {
    if (!apiToken || !activeRoom || !groupSettings) return;
    setBusy(true);
    try {
      const updated = await updateConversationSettings(apiToken, activeRoom.id, {
        title: roomName.trim(),
        description: roomDescription.trim(),
        themeKey: groupSettings.themeKey,
        themeMode: groupSettings.themeMode,
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
    if (!apiToken) {
      showAlert(lang === 'fa' ? 'اول به API وصل شو.' : 'Connect to the API first.');
      setModal('login');
      return;
    }
    setActiveRoom(room);
    setMessages([]);
    setMessageDraft('');
    setModal('chat');
  };

  const submitMessage = async () => {
    if (!apiToken || !activeRoom || !messageDraft.trim()) return;
    setBusy(true);
    try {
      const result = await sendMessage(apiToken, activeRoom.id, messageDraft.trim());
      setMessages(previous => [...previous, result.message]);
      setMessageDraft('');
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Could not send message.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (modal !== 'chat' || !apiToken || !activeRoom) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const result = await getMessages(apiToken, activeRoom.id);
        if (!cancelled) setMessages(result.messages);
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
  const labelForTab = (x: Tab) => t[x];

  const Header = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <View style={{ flex: 1, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
        <Text style={[styles.brandSmall, { color: c.primary }]}>{title}</Text>
        {!!subtitle && <Text style={[styles.headerSub, { color: c.muted, textAlign: isRTL ? 'right' : 'left' }]}>{subtitle}</Text>}
      </View>
      <Pressable onPress={() => setModal('profile')} style={[styles.avatarButton, { backgroundColor: c.soft }]}>
        {photo ? <Image source={{ uri: photo }} style={styles.avatarSmall} /> : <Ionicons name="person" size={20} color={c.primary} />}
      </Pressable>
    </View>
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

  

  const renderRoom = (room: Room) => (
    <Pressable key={room.id} onPress={() => openRoom(room)} style={[styles.chatRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: c.border }]}>
      <Avatar icon={room.icon} color={room.kind === 'group' ? '#10B981' : '#EC4899'} />
      <View style={[styles.chatInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
        <Text style={[styles.chatTitle, { color: c.text }]}>{room.title}</Text>
        <Text numberOfLines={1} style={[styles.chatSubtitle, { color: c.muted }]}>{room.subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.muted} />
    </Pressable>
  );

  const renderHome = () => (
    <>
      <Animated.View style={[styles.hero, { backgroundColor: dark ? '#211E4A' : '#EAE9FF', opacity: heroMotion, transform: [{ translateY: heroMotion.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
        <Animated.View style={[styles.heroGlow, { backgroundColor: c.primary, opacity: heroMotion.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.13] }), transform: [{ scale: heroMotion.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }] }]} />
        <Text style={[styles.heroEyebrow, { color: c.primary }]}>{t.brand.toUpperCase()} · {t.demo}</Text>
        <Text style={[styles.heroTitle, { color: c.text, textAlign: isRTL ? 'right' : 'left' }]}>{t.welcome}</Text>
        <Text style={[styles.heroSubtitle, { color: c.muted, textAlign: isRTL ? 'right' : 'left' }]}>{t.overview}</Text>
        <View style={[styles.heroButtons, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable onPress={() => { setModal('group'); setRoomName(''); }} style={[styles.primaryButton, { backgroundColor: c.primary }]}>
            <Ionicons name="people-outline" size={17} color="#FFF" /><Text style={styles.primaryButtonText}>{t.createGroup}</Text>
          </Pressable>
          <Pressable onPress={() => { setModal('channel'); setRoomName(''); }} style={[styles.secondaryButton, { backgroundColor: c.surface }]}>
            <Ionicons name="megaphone-outline" size={17} color={c.primary} /><Text style={[styles.secondaryButtonText, { color: c.primary }]}>{t.createChannel}</Text>
          </Pressable>
        </View>
      </Animated.View>
      <View style={[styles.searchBox, { backgroundColor: c.surface, borderColor: c.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Ionicons name="search" size={19} color={c.muted} />
        <TextInput value={search} onChangeText={setSearch} placeholder={t.search} placeholderTextColor={c.muted} style={[styles.searchInput, { color: c.text, textAlign: isRTL ? 'right' : 'left' }]} />
        {!!search && <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color={c.muted} /></Pressable>}
      </View>
      <SectionTitle title={t.recent} action={t.seeAll} />
      <View style={[styles.listCard, { backgroundColor: c.surface }]}>
        {filteredChats.map(renderRoom)}
        {filteredChats.length === 0 && <Text style={[styles.emptyHint, { color: c.muted }]}>{t.emptyTitle}</Text>}
      </View>
      <View style={[styles.infoStrip, { backgroundColor: c.surface, borderColor: c.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Ionicons name="shield-checkmark-outline" size={22} color={c.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.infoTitle, { color: c.text }]}>{lang === 'fa' ? 'وطن، در حال ساخته‌شدن' : 'Vatan is taking shape'}</Text>
          <Text style={[styles.infoText, { color: c.muted }]}>{t.backend}</Text>
        </View>
      </View>
    </>
  );

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
        {foundUsers.map(person => <Pressable key={person.id} onPress={() => { void startDirectChat(person); }} style={[styles.chatRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: c.border }]}>
          <Avatar icon="person" color={c.primary} uri={person.avatarUrl} />
          <View style={[styles.chatInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}><Text style={[styles.chatTitle, { color: c.text }]}>{person.displayName}</Text><Text style={[styles.chatSubtitle, { color: c.muted }]}>@{person.username}</Text></View>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={c.primary} />
        </Pressable>)}
        {foundUsers.length === 0 && <Text style={[styles.emptyHint, { color: c.muted }]}>{busy ? '…' : t.noContacts}</Text>}
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
        {[['lock-closed-outline', t.privacy], ['notifications-outline', t.notifications], ['information-circle-outline', t.about]].map(([icon, title]) => (
          <Pressable key={title} onPress={() => showAlert(lang === 'fa' ? 'این بخش در نسخه‌های بعدی تکمیل می‌شود.' : 'This section will be completed in a future release.')} style={[styles.settingRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={[styles.settingIcon, { backgroundColor: c.soft }]}><Ionicons name={icon as any} size={20} color={c.primary} /></View>
            <Text style={[styles.settingLabel, { color: c.text }]}>{title}</Text>
            <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={c.muted} />
          </Pressable>
        ))}
      </View>
      <Pressable onPress={signOut} disabled={busy} style={[styles.loginButton, { borderColor: c.border }]}><Ionicons name="log-out-outline" size={19} color={c.primary} /><Text style={{ color: c.primary, fontWeight: '800' }}>{lang === 'fa' ? 'خروج از حساب' : 'Sign out'}</Text></Pressable>
      {!!saved && <Text style={{ textAlign: 'center', color: c.primary, marginTop: 12 }}>{t.saved}</Text>}
    </>
  );

  const navItems: { key: Tab; icon: any; active: any }[] = [
    { key: 'chats', icon: 'chatbubble-ellipses-outline', active: 'chatbubble-ellipses' },
    { key: 'contacts', icon: 'people-outline', active: 'people' },
    { key: 'groups', icon: 'grid-outline', active: 'grid' },
    { key: 'channels', icon: 'megaphone-outline', active: 'megaphone' },
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
          <View style={{ alignItems: 'center', marginBottom: 28 }}>
            <View style={{ width: 82, height: 82, borderRadius: 27, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 16, shadowColor: c.primary, shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
              <Ionicons name="chatbubbles" size={42} color="#FFFFFF" />
            </View>
            <Text style={{ color: c.text, fontSize: 32, fontWeight: '900' }}>{lang === 'fa' ? 'وطن' : 'Vatan'}</Text>
            <Text style={{ color: c.muted, fontSize: 13, marginTop: 5, textAlign: 'center' }}>{lang === 'fa' ? 'ارتباط، نزدیک‌تر از همیشه' : 'Closer, wherever you are'}</Text>
          </View>
          <View style={{ backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 26, padding: 20, shadowColor: '#172033', shadowOpacity: 0.06, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 3 }}>
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
            <Pressable disabled={busy} onPress={() => { void loginToApi(); }} style={[styles.modalPrimary, { backgroundColor: c.primary, opacity: busy ? 0.6 : 1, marginTop: 16, borderRadius: 15, paddingVertical: 16 }]}>
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
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={c.bg} />
      <Header title={tab === 'chats' ? t.brand : labelForTab(tab)} subtitle={tab === 'chats' ? t.tagline : undefined} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: tabMotion, transform: [{ translateY: tabMotion.interpolate({ inputRange: [0, 1], outputRange: [9, 0] }) }] }}>
          {tab === 'chats' && renderHome()}
          {tab === 'contacts' && renderContacts()}
          {tab === 'groups' && renderCollection('group')}
          {tab === 'channels' && renderCollection('channel')}
          {tab === 'settings' && renderSettings()}
        </Animated.View>
      </ScrollView>
      <View style={[styles.bottomNav, { backgroundColor: dark ? 'rgba(19,27,46,0.78)' : 'rgba(255,255,255,0.82)', borderTopColor: c.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <BlurView intensity={dark ? 45 : 65} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        {navItems.map(item => {
          const active = tab === item.key;
          return <Pressable key={item.key} onPress={() => setTab(item.key)} style={styles.navItem} android_ripple={{ color: c.soft, borderless: false }}>
            <View style={[styles.navIconWrap, active && { backgroundColor: c.soft }]}><Ionicons name={active ? item.active : item.icon} size={21} color={active ? c.primary : c.muted} /></View>
            <Text style={{ fontSize: 10, color: active ? c.primary : c.muted, fontWeight: active ? '800' : '500' }}>{labelForTab(item.key)}</Text>
          </Pressable>;
        })}
      </View>

      <Modal visible={modal !== null} transparent={modal !== 'chat'} animationType="slide" onRequestClose={() => setModal(null)}>
        <KeyboardAvoidingView style={[styles.modalBackdrop, modal === 'chat' && { backgroundColor: c.bg, justifyContent: 'flex-start' }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {modal !== 'chat' && <Pressable style={styles.modalDismiss} onPress={() => setModal(null)} />}
          <View style={[styles.modalSheet, { backgroundColor: c.surface }, modal === 'chat' && styles.fullChatSheet]}>
            <View style={[styles.modalHandle, { backgroundColor: c.border }]} />
            <View style={[styles.modalHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.modalTitle, { color: c.text }]}>{modal === 'group' ? t.newGroup : modal === 'channel' ? t.newChannel : modal === 'profile' ? t.editProfile : modal === 'groupSettings' ? (lang === 'fa' ? 'تنظیمات گروه' : 'Group settings') : modal === 'chat' ? (activeRoom?.title ?? t.chats) : t.phone}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                {modal === 'chat' && activeRoom?.kind === 'group' && <Pressable onPress={() => { void openGroupSettings(); }}><Ionicons name="settings-outline" size={22} color={c.primary} /></Pressable>}
                <Pressable onPress={() => setModal(null)}><Ionicons name="close" size={24} color={c.muted} /></Pressable>
              </View>
            </View>
            {modal === 'group' || modal === 'channel' ? <>
              <Text style={[styles.fieldLabel, { color: c.muted }]}>{t.name}</Text>
              <TextInput value={roomName} onChangeText={setRoomName} placeholder={modal === 'group' ? (lang === 'fa' ? 'مثلاً دوستان' : 'e.g. Friends') : (lang === 'fa' ? 'مثلاً اخبار وطن' : 'e.g. Vatan News')} placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: isRTL ? 'right' : 'left' }]} maxLength={60} />
              <Text style={[styles.fieldLabel, { color: c.muted }]}>{t.description}</Text>
              <TextInput value={roomDescription} onChangeText={setRoomDescription} placeholder={t.description} placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: isRTL ? 'right' : 'left' }]} maxLength={180} />
              <Text style={[styles.demoNote, { color: c.muted }]}>{apiToken ? (lang === 'fa' ? 'این گفتگو روی سرور ساخته می‌شود.' : 'This conversation will be created on the server.') : (lang === 'fa' ? 'برای ساخت گفتگو باید ابتدا به API وصل شوی.' : 'Connect to the API before creating a conversation.')}</Text>
              <Pressable onPress={createRoom} style={[styles.modalPrimary, { backgroundColor: c.primary }]}><Text style={styles.primaryButtonText}>{t.create}</Text></Pressable>
            </> : modal === 'groupSettings' ? <>
              <ScrollView style={{ maxHeight: '76%' }} keyboardShouldPersistTaps="handled">
                <Text style={[styles.fieldLabel, { color: c.muted }]}>{t.name}</Text>
                <TextInput value={roomName} onChangeText={setRoomName} maxLength={100} placeholder={t.name} placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: isRTL ? 'right' : 'left' }]} />
                <Text style={[styles.fieldLabel, { color: c.muted }]}>{t.description}</Text>
                <TextInput value={roomDescription} onChangeText={setRoomDescription} maxLength={280} placeholder={t.description} placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: isRTL ? 'right' : 'left' }]} />
                <Text style={[styles.fieldLabel, { color: c.muted }]}>{lang === 'fa' ? 'تم گروه' : 'Group theme'}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {(['violet','blue','green','rose','amber','midnight','ocean'] as const).map((key, index) => {
                    const colors = ['#5B52E8','#2878E8','#159A73','#E34E86','#D98B16','#202B45','#008DA8'];
                    return <Pressable key={key} onPress={() => setGroupSettings(current => current ? { ...current, themeKey: key } : current)} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: colors[index], borderWidth: groupSettings?.themeKey === key ? 3 : 1, borderColor: groupSettings?.themeKey === key ? c.text : 'transparent' }}><Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>{key}</Text></Pressable>;
                  })}
                </View>
                {groupSettings && <>
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
                {groupMembers.map(member => {
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
              <Pressable disabled={busy} onPress={() => { void saveGroupSettings(); }} style={[styles.modalPrimary, { backgroundColor: c.primary, opacity: busy ? 0.6 : 1 }]}><Text style={styles.primaryButtonText}>{busy ? '…' : t.save}</Text></Pressable>
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
              <Text style={[styles.fieldLabel, { color: c.muted }]}>{t.birthday}</Text>
              <TextInput value={birthYear} onChangeText={v => setBirthYear(v.replace(/[^0-9]/g, '').slice(0, 4))} keyboardType="number-pad" placeholder={calendar === 'solar' ? 'مثلاً ۱۳۹۰' : 'مثلاً 2011'} placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: isRTL ? 'right' : 'left' }]} />
              <Text style={[styles.fieldLabel, { color: c.muted }]}>{t.calendar}</Text>
              <View style={[styles.segment, { backgroundColor: c.input, alignSelf: 'stretch', flexDirection: isRTL ? 'row-reverse' : 'row', marginBottom: 14 }]}>
                {(['solar', 'gregorian'] as const).map(v => <Pressable key={v} onPress={() => setCalendar(v)} style={[styles.calendarOption, calendar === v && { backgroundColor: c.primary }]}><Text style={{ color: calendar === v ? '#FFF' : c.muted, fontWeight: '700' }}>{v === 'solar' ? t.solar : t.gregorian}</Text></Pressable>)}
              </View>
              <Pressable disabled={busy} onPress={() => { void saveProfile(); }} style={[styles.modalPrimary, { backgroundColor: c.primary, opacity: busy ? 0.6 : 1 }]}><Text style={styles.primaryButtonText}>{busy ? '…' : t.save}</Text></Pressable>
              <Text style={[styles.demoNote, { color: c.muted }]}>{t.privateNote}</Text>
            </> : modal === 'chat' ? <>
              <ScrollView style={styles.fullChatMessages} contentContainerStyle={{ gap: 10, paddingVertical: 14 }} keyboardShouldPersistTaps="handled">
                {messages.length === 0 ? <Text style={[styles.demoNote, { color: c.muted, textAlign: 'center' }]}>{lang === 'fa' ? 'هنوز پیامی وجود ندارد. اولین پیام را بفرست.' : 'No messages yet. Send the first message.'}</Text> : messages.map(message => {
                  const mine = message.senderId === userId;
                  return <View key={message.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: mine ? c.soft : c.input, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 }}>
                    {!mine && <Text style={{ color: c.primary, fontSize: 10, fontWeight: '800', marginBottom: 3 }}>{message.displayName}</Text>}
                    <Text style={{ color: c.text, fontSize: 13 }}>{message.body}</Text>
                    <Text style={{ color: c.muted, fontSize: 9, marginTop: 4 }}>{message.createdAt}</Text>
                  </View>;
                })}
              </ScrollView>
              {activeRoom?.kind === 'group' && <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <TextInput value={memberUsername} onChangeText={setMemberUsername} autoCapitalize="none" placeholder={lang === 'fa' ? 'افزودن با نام کاربری' : 'Add member by username'} placeholderTextColor={c.muted} style={[styles.fieldInput, { flex: 1, color: c.text, backgroundColor: c.input, borderColor: c.border, marginBottom: 0 }]} />
                <Pressable disabled={busy || !memberUsername.trim()} onPress={() => { void inviteMember(); }} style={[styles.memberAddButton, { backgroundColor: c.soft }]}><Ionicons name="person-add" size={18} color={c.primary} /></Pressable>
              </View>}
              <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <TextInput value={messageDraft} onChangeText={setMessageDraft} placeholder={lang === 'fa' ? 'پیامت را بنویس…' : 'Write a message…'} placeholderTextColor={c.muted} multiline style={[styles.fieldInput, { flex: 1, color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: isRTL ? 'right' : 'left', maxHeight: 90, marginBottom: 0 }]} />
                <Pressable disabled={busy || !messageDraft.trim()} onPress={() => { void submitMessage(); }} style={[styles.modalPrimary, { backgroundColor: c.primary, paddingHorizontal: 16, opacity: busy || !messageDraft.trim() ? 0.55 : 1 }]}><Ionicons name="send" size={18} color="#FFF" /></Pressable>
              </View>
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
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

export default function App() {
  return <SafeAreaProvider><AppContent /></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  bottomNav: { minHeight: 78, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 14 : 9, paddingHorizontal: 8, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'space-around', overflow: 'hidden', shadowColor: '#172033', shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: -5 }, elevation: 12 },
  navItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 2, paddingVertical: 2, borderRadius: 15 },
  navIconWrap: { width: 44, height: 31, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fullChatSheet: { flex: 1, width: '100%', maxHeight: '100%', height: '100%', borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingTop: Platform.OS === 'ios' ? 54 : 20, paddingBottom: Platform.OS === 'ios' ? 28 : 16, paddingHorizontal: 16 },
  fullChatMessages: { flex: 1, maxHeight: undefined },
  memberAddButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  authModeSwitch: { borderRadius: 14, padding: 4, gap: 4, marginBottom: 10 },
  authModeItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 10 },
  header: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 16, alignItems: 'center', gap: 12 },
  brandSmall: { fontSize: 25, fontWeight: '900', letterSpacing: -0.6 },
  headerSub: { fontSize: 11, marginTop: 2 },
  avatarButton: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarSmall: { width: 42, height: 42 },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 24 },
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
  chatRow: { alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
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
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 32 : 20, maxHeight: '92%' },
  modalHandle: { width: 42, height: 4, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
  modalHeader: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle: { fontSize: 20, fontWeight: '900' },
  fieldLabel: { fontSize: 12, fontWeight: '800', marginBottom: 7, marginTop: 8 },
  fieldInput: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14, marginBottom: 6 },
  demoNote: { fontSize: 11, lineHeight: 17, marginTop: 8, marginBottom: 10 },
  modalPrimary: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  cancelButton: { alignItems: 'center', padding: 13, marginTop: 4 }
});