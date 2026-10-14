import React, { useMemo, useState } from 'react';
import { Alert, I18nManager, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

type Language = 'fa' | 'en';
type ThemeMode = 'light' | 'dark';
type Tab = 'chats' | 'contacts' | 'groups' | 'channels' | 'settings';
type Room = { id: string; title: string; subtitle: string; icon: string; kind: 'group' | 'channel' };

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
    noContacts: 'هنوز مخاطبی وجود ندارد', demo: 'نسخه نمایشی', phone: 'ورود با شماره موبایل',
    phoneHint: 'شماره موبایل', continue: 'ادامه', backend: 'ورود پیامکی در مرحله اتصال بک‌اند فعال می‌شود.',
    members: 'عضو', subscribers: 'دنبال‌کننده', newMessage: 'پیام جدید', profileHint: 'خودت را به دیگران معرفی کن',
    home: 'خانه', all: 'همه', privateNote: 'اطلاعات پروفایل فعلاً روی همین صفحه نگه داشته می‌شود.'
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
    noContacts: 'No contacts yet', demo: 'DEMO', phone: 'Continue with phone',
    phoneHint: 'Phone number', continue: 'Continue', backend: 'SMS sign-in will be enabled when the backend is connected.',
    members: 'members', subscribers: 'subscribers', newMessage: 'New message', profileHint: 'Let people know you',
    home: 'Home', all: 'All', privateNote: 'Profile changes are currently kept in this screen only.'
  }
};

const INITIAL_CHATS = [
  { id: '1', title: 'تیم وطن', subtitle: 'جلسه فردا ساعت ۱۰ یادتون نره', icon: 'people', color: '#6C63FF', time: '۱۰:۲۴', unread: 2 },
  { id: '2', title: 'مریم احمدی', subtitle: 'عالیه، پس هماهنگ شد ✨', icon: 'person', color: '#F59E0B', time: 'دیروز', unread: 0 },
  { id: '3', title: 'گروه برنامه‌نویسی', subtitle: 'علی: نسخه جدید آماده شد', icon: 'code-slash', color: '#10B981', time: 'دیروز', unread: 5 },
  { id: '4', title: 'اخبار فناوری', subtitle: 'خبرهای جدید دنیای تکنولوژی', icon: 'planet', color: '#EC4899', time: 'سه‌شنبه', unread: 0 }
];

function AppContent() {
  const [lang, setLang] = useState<Language>('fa');
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [tab, setTab] = useState<Tab>('chats');
  const [displayName, setDisplayName] = useState('هیراد');
  const [username, setUsername] = useState('hirad');
  const [birthYear, setBirthYear] = useState('');
  const [calendar, setCalendar] = useState<'solar' | 'gregorian'>('solar');
  const [photo, setPhoto] = useState<string | null>(null);
  const [modal, setModal] = useState<'group' | 'channel' | 'profile' | 'login' | null>(null);
  const [roomName, setRoomName] = useState('');
  const [roomDescription, setRoomDescription] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [search, setSearch] = useState('');
  const [phone, setPhone] = useState('');
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
  const filteredChats = useMemo(() => INITIAL_CHATS.filter(x => (x.title + x.subtitle).toLowerCase().includes(search.toLowerCase())), [search]);

  const showAlert = (message: string) => Alert.alert(t.brand, message);
  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { showAlert(lang === 'fa' ? 'برای انتخاب عکس، اجازه دسترسی به گالری را بده.' : 'Please allow photo library access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (!result.canceled && result.assets[0]) setPhoto(result.assets[0].uri);
  };
  const createRoom = () => {
    if (!roomName.trim()) { showAlert(lang === 'fa' ? 'اول یک نام وارد کن.' : 'Please enter a name first.'); return; }
    setRooms(prev => [{ id: String(Date.now()), title: roomName.trim(), subtitle: roomDescription.trim() || (lang === 'fa' ? 'تازه ساخته شده' : 'Just created'), icon: modal === 'group' ? 'people' : 'megaphone', kind: modal === 'group' ? 'group' : 'channel' }, ...prev]);
    setRoomName(''); setRoomDescription(''); setModal(null);
    setTab(modal === 'group' ? 'groups' : 'channels');
  };
  const saveProfile = () => { setModal(null); setSaved(true); setTimeout(() => setSaved(false), 2400); };
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

  const renderChatRow = (item: typeof INITIAL_CHATS[number]) => (
    <Pressable key={item.id} onPress={() => showAlert(lang === 'fa' ? 'گفت‌وگوی زنده بعد از اتصال سرویس پیام‌رسان فعال می‌شود.' : 'Live chat will be available after connecting the messaging service.')} style={[styles.chatRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: c.border }]}>
      <Avatar icon={item.icon} color={item.color} />
      <View style={[styles.chatInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
        <Text numberOfLines={1} style={[styles.chatTitle, { color: c.text, textAlign: isRTL ? 'right' : 'left' }]}>{item.title}</Text>
        <Text numberOfLines={1} style={[styles.chatSubtitle, { color: c.muted, textAlign: isRTL ? 'right' : 'left' }]}>{item.subtitle}</Text>
      </View>
      <View style={{ alignItems: 'center', gap: 7 }}>
        <Text style={{ color: c.muted, fontSize: 10 }}>{item.time}</Text>
        {item.unread > 0 && <View style={styles.unread}><Text style={styles.unreadText}>{item.unread}</Text></View>}
      </View>
    </Pressable>
  );

  const renderRoom = (room: Room) => (
    <Pressable key={room.id} onPress={() => showAlert(lang === 'fa' ? 'پیام‌رسانی زنده پس از اتصال بک‌اند فعال می‌شود.' : 'Live messaging will be enabled once the backend is connected.')} style={[styles.chatRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: c.border }]}>
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
      <View style={[styles.hero, { backgroundColor: dark ? '#211E4A' : '#EAE9FF' }]}>
        <View style={[styles.heroGlow, { backgroundColor: c.primary }]} />
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
      </View>
      <View style={[styles.searchBox, { backgroundColor: c.surface, borderColor: c.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Ionicons name="search" size={19} color={c.muted} />
        <TextInput value={search} onChangeText={setSearch} placeholder={t.search} placeholderTextColor={c.muted} style={[styles.searchInput, { color: c.text, textAlign: isRTL ? 'right' : 'left' }]} />
        {!!search && <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color={c.muted} /></Pressable>}
      </View>
      <SectionTitle title={t.recent} action={t.seeAll} />
      <View style={[styles.listCard, { backgroundColor: c.surface }]}>
        {filteredChats.map(renderChatRow)}
        {rooms.slice(0, 2).map(renderRoom)}
        {filteredChats.length === 0 && rooms.length === 0 && <Text style={[styles.emptyHint, { color: c.muted }]}>{t.emptyTitle}</Text>}
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
      <View style={[styles.collectionHero, { backgroundColor: c.soft, alignItems: 'center' }]}>
        <Avatar icon="people" color={c.primary} size={68} />
        <Text style={[styles.pageTitle, { color: c.text }]}>{t.contacts}</Text>
        <Text style={[styles.pageSubtitle, { color: c.muted, textAlign: 'center' }]}>{lang === 'fa' ? 'مخاطبینت بعد از اجازه دسترسی و اتصال سرویس همگام‌سازی نمایش داده می‌شوند.' : 'Contacts will appear after permission and contact-sync services are configured.'}</Text>
        <Pressable onPress={() => showAlert(lang === 'fa' ? 'همگام‌سازی مخاطبین در مرحله بعد اضافه می‌شود.' : 'Contact sync will be added in a later stage.')} style={[styles.secondaryButton, { backgroundColor: c.surface, marginTop: 16 }]}><Ionicons name="sync-outline" size={18} color={c.primary} /><Text style={[styles.secondaryButtonText, { color: c.primary }]}>{lang === 'fa' ? 'همگام‌سازی مخاطبین' : 'Sync contacts'}</Text></Pressable>
      </View>
      <Text style={[styles.emptyHint, { color: c.muted }]}>{t.noContacts}</Text>
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
      <Pressable onPress={() => setModal('login')} style={[styles.loginButton, { borderColor: c.border }]}><Ionicons name="call-outline" size={19} color={c.primary} /><Text style={{ color: c.primary, fontWeight: '800' }}>{t.phone}</Text></Pressable>
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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={c.bg} />
      <Header title={tab === 'chats' ? t.brand : labelForTab(tab)} subtitle={tab === 'chats' ? t.tagline : undefined} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {tab === 'chats' && renderHome()}
        {tab === 'contacts' && renderContacts()}
        {tab === 'groups' && renderCollection('group')}
        {tab === 'channels' && renderCollection('channel')}
        {tab === 'settings' && renderSettings()}
      </ScrollView>
      <View style={[styles.bottomNav, { backgroundColor: c.surface, borderTopColor: c.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {navItems.map(item => {
          const active = tab === item.key;
          return <Pressable key={item.key} onPress={() => setTab(item.key)} style={styles.navItem}>
            <View style={[styles.navIconWrap, active && { backgroundColor: c.soft }]}><Ionicons name={active ? item.active : item.icon} size={21} color={active ? c.primary : c.muted} /></View>
            <Text style={{ fontSize: 10, color: active ? c.primary : c.muted, fontWeight: active ? '800' : '500' }}>{labelForTab(item.key)}</Text>
          </Pressable>;
        })}
      </View>

      <Modal visible={modal !== null} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalDismiss} onPress={() => setModal(null)} />
          <View style={[styles.modalSheet, { backgroundColor: c.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: c.border }]} />
            <View style={[styles.modalHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.modalTitle, { color: c.text }]}>{modal === 'group' ? t.newGroup : modal === 'channel' ? t.newChannel : modal === 'profile' ? t.editProfile : t.phone}</Text>
              <Pressable onPress={() => setModal(null)}><Ionicons name="close" size={24} color={c.muted} /></Pressable>
            </View>
            {modal === 'group' || modal === 'channel' ? <>
              <Text style={[styles.fieldLabel, { color: c.muted }]}>{t.name}</Text>
              <TextInput value={roomName} onChangeText={setRoomName} placeholder={modal === 'group' ? (lang === 'fa' ? 'مثلاً دوستان' : 'e.g. Friends') : (lang === 'fa' ? 'مثلاً اخبار وطن' : 'e.g. Vatan News')} placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: isRTL ? 'right' : 'left' }]} maxLength={60} />
              <Text style={[styles.fieldLabel, { color: c.muted }]}>{t.description}</Text>
              <TextInput value={roomDescription} onChangeText={setRoomDescription} placeholder={t.description} placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: isRTL ? 'right' : 'left' }]} maxLength={180} />
              <Text style={[styles.demoNote, { color: c.muted }]}>{lang === 'fa' ? 'این مورد فعلاً به‌صورت محلی ساخته می‌شود؛ برای دعوت اعضا به بک‌اند نیاز داریم.' : 'Created locally for now; inviting members requires a backend.'}</Text>
              <Pressable onPress={createRoom} style={[styles.modalPrimary, { backgroundColor: c.primary }]}><Text style={styles.primaryButtonText}>{t.create}</Text></Pressable>
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
              <Pressable onPress={saveProfile} style={[styles.modalPrimary, { backgroundColor: c.primary }]}><Text style={styles.primaryButtonText}>{t.save}</Text></Pressable>
              <Text style={[styles.demoNote, { color: c.muted }]}>{t.privateNote}</Text>
            </> : <>
              <Text style={[styles.fieldLabel, { color: c.muted }]}>{t.phoneHint}</Text>
              <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+98 912 000 0000" placeholderTextColor={c.muted} style={[styles.fieldInput, { color: c.text, backgroundColor: c.input, borderColor: c.border, textAlign: 'left' }]} />
              <Text style={[styles.demoNote, { color: c.muted }]}>{t.backend}</Text>
              <Pressable onPress={() => showAlert(t.backend)} style={[styles.modalPrimary, { backgroundColor: c.primary }]}><Text style={styles.primaryButtonText}>{t.continue}</Text></Pressable>
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