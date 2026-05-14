import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { isSupabaseConfigured, supabase, supabaseConfigError } from './lib/supabaseClient'
import './App.css'

const DEFAULT_CAFE_SLUG = 'demo-cafe'
const CART_KEY_PREFIX = 'bizgrowth-cafe-cart-v3'
const ORDER_QUEUE_KEY_PREFIX = 'bizgrowth-cafe-order-queue-v2'

const STATUS_OPTIONS = ['pending', 'preparing', 'ready', 'completed', 'cancelled']

const PAYMENT_OPTIONS = [
  { id: 'card', label: 'Card', enabledKey: 'enable_card', helper: 'Simulated card payment.' },
  { id: 'gcash', label: 'GCash', enabledKey: 'enable_gcash', helper: 'Simulated GCash payment.' },
  { id: 'counter', label: 'Counter', enabledKey: 'enable_counter', helper: 'Pay at the counter with your order code.' },
]

const ADMIN_TABS = [
  { id: 'details', label: 'Cafe Details' },
  { id: 'theme', label: 'Theme' },
  { id: 'payments', label: 'Payments' },
  { id: 'menu', label: 'Menu' },
  { id: 'orders', label: 'Order Settings' },
  { id: 'qr', label: 'QR Codes' },
]

const getAdminTabId = (tabId) =>
  ADMIN_TABS.some((tab) => tab.id === tabId) ? tabId : 'details'

const normalizeCafeSlug = (slug) =>
  String(slug || DEFAULT_CAFE_SLUG)
    .trim()
    .toLowerCase() || DEFAULT_CAFE_SLUG

const getCafePath = (cafeSlug, path = '/customer') => `/c/${normalizeCafeSlug(cafeSlug)}${path}`

const getCafeSlugFromPath = (pathname) => {
  const match = pathname.match(/^\/c\/([^/]+)/)
  return match ? normalizeCafeSlug(match[1]) : DEFAULT_CAFE_SLUG
}

const getCartKey = (cafeSlug) => `${CART_KEY_PREFIX}:${normalizeCafeSlug(cafeSlug)}`
const getOrderQueueKey = (cafeSlug) => `${ORDER_QUEUE_KEY_PREFIX}:${normalizeCafeSlug(cafeSlug)}`

const DEFAULT_SETTINGS = {
  cafe_slug: DEFAULT_CAFE_SLUG,
  cafe_name: 'BizGrowth Cafe',
  tagline: 'Order ahead. Skip the line.',
  welcome_text: 'Browse the menu, build your order, and choose your payment path before reaching the counter.',
  logo_url: '',
  hero_image_url: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1200&q=80',
  primary_color: '#5b74d6',
  accent_color: '#6f55c8',
  warm_color: '#f08ba8',
  enable_card: true,
  enable_gcash: true,
  enable_counter: true,
  gcash_number: '0917 000 0000',
  order_prefix: 'BG',
  require_customer_name: true,
  counter_instructions: 'Show your order code to the counter staff before food prep starts.',
  staff_access_code: '',
}

const DEFAULT_MENU_ITEMS = [
  {
    id: 'demo-velvet-latte',
    name: 'Velvet Latte',
    description: 'Espresso with steamed milk, vanilla cream, and a soft caramel finish.',
    category: 'Coffee',
    price: 145,
    image_url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=80',
    is_available: true,
  },
  {
    id: 'demo-cold-brew-cloud',
    name: 'Cold Brew Cloud',
    description: 'Slow-steeped coffee with milk foam and brown sugar syrup.',
    category: 'Coffee',
    price: 160,
    image_url: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=80',
    is_available: true,
  },
  {
    id: 'demo-matcha-cream',
    name: 'Matcha Cream',
    description: 'Ceremonial matcha with fresh milk and a light vanilla top.',
    category: 'Tea',
    price: 155,
    image_url: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=900&q=80',
    is_available: true,
  },
  {
    id: 'demo-truffle-pasta',
    name: 'Truffle Chicken Pasta',
    description: 'Cream pasta with chicken, parmesan, and truffle oil.',
    category: 'Meals',
    price: 265,
    image_url: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=900&q=80',
    is_available: true,
  },
]

const EMPTY_MENU_FORM = {
  name: '',
  description: '',
  category: 'Coffee',
  price: '',
  image_url: '',
  is_available: true,
}

const formatPeso = (value) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)

const normalizeError = (error) => error?.message || 'Something went wrong. Please try again.'

const readStoredCart = (cafeSlug) => {
  try {
    const stored = localStorage.getItem(getCartKey(cafeSlug))
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

const readStoredOrderRefs = (cafeSlug) => {
  try {
    const stored = localStorage.getItem(getOrderQueueKey(cafeSlug))
    const parsed = stored ? JSON.parse(stored) : []

    return Array.isArray(parsed)
      ? parsed.filter((order) => order?.id && order?.receipt_token)
      : []
  } catch {
    return []
  }
}

const writeStoredOrderRefs = (cafeSlug, orders) => {
  localStorage.setItem(getOrderQueueKey(cafeSlug), JSON.stringify(orders))
}

const saveOrderReference = (cafeSlug, order) => {
  if (!order?.id || !order?.receipt_token) {
    return readStoredOrderRefs(cafeSlug)
  }

  const savedOrder = {
    id: order.id,
    receipt_token: order.receipt_token,
    order_code: order.order_code || '',
    customer_name: order.customer_name || '',
    total_amount: order.total_amount || 0,
    created_at: order.created_at || new Date().toISOString(),
    saved_at: new Date().toISOString(),
  }
  const existingOrders = readStoredOrderRefs(cafeSlug).filter((item) => item.id !== savedOrder.id)
  const nextOrders = [savedOrder, ...existingOrders].slice(0, 20)

  writeStoredOrderRefs(cafeSlug, nextOrders)
  return nextOrders
}

const removeOrderReference = (cafeSlug, orderId) => {
  const nextOrders = readStoredOrderRefs(cafeSlug).filter((item) => item.id !== orderId)
  writeStoredOrderRefs(cafeSlug, nextOrders)
  return nextOrders
}

const normalizeSettings = (settings = {}) => ({
  ...DEFAULT_SETTINGS,
  ...Object.fromEntries(
    Object.entries(settings || {}).filter(([, value]) => value !== null && value !== undefined),
  ),
})

const getBrandInitials = (name) =>
  String(name || 'BG')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

const createFallbackFavicon = (settings) => {
  const initials = getBrandInitials(settings.cafe_name)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <defs>
        <linearGradient id="bg" x1="8" y1="8" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop stop-color="${settings.primary_color || DEFAULT_SETTINGS.primary_color}"/>
          <stop offset=".55" stop-color="${settings.accent_color || DEFAULT_SETTINGS.accent_color}"/>
          <stop offset="1" stop-color="${settings.warm_color || DEFAULT_SETTINGS.warm_color}"/>
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#bg)"/>
      <circle cx="46" cy="18" r="12" fill="#ffffff" fill-opacity=".22"/>
      <text x="32" y="40" text-anchor="middle" fill="#fff" font-family="Poppins, Arial, sans-serif" font-size="24" font-weight="800">${initials || 'BG'}</text>
    </svg>
  `

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const getFaviconMimeType = (href) => {
  const match = href.match(/^data:(image\/[^;,]+)/)
  return match?.[1] || ''
}

const updateDocumentBrand = (settings) => {
  document.title = settings.cafe_name || DEFAULT_SETTINGS.cafe_name

  const faviconHref = settings.logo_url?.trim() || createFallbackFavicon(settings)
  let faviconLink = document.querySelector('link[rel="icon"]')

  if (!faviconLink) {
    faviconLink = document.createElement('link')
    faviconLink.rel = 'icon'
    document.head.appendChild(faviconLink)
  }

  const mimeType = getFaviconMimeType(faviconHref)

  if (mimeType) {
    faviconLink.type = mimeType
  } else {
    faviconLink.removeAttribute('type')
  }

  faviconLink.href = faviconHref
}

const getHashUrl = (path) => `${window.location.origin}${window.location.pathname}#${path}`

const LOGO_CROP_FRAME_SIZE = 260
const LOGO_OUTPUT_SIZE = 256
const LOGO_EXPORT_QUALITY = 0.82
const LOGO_MAX_FILE_SIZE = 6 * 1024 * 1024
const IMAGE_MAX_FILE_SIZE = 6 * 1024 * 1024
const HERO_IMAGE_OUTPUT_SIZE = 1200
const MENU_IMAGE_OUTPUT_SIZE = 900
const IMAGE_UPLOAD_MAX_DATA_URL_LENGTH = 420000
const IMAGE_EXPORT_QUALITIES = [0.78, 0.68, 0.58]
const IMAGE_OUTPUT_SCALES = [1, 0.82, 0.68]

const createLogoDataUrl = (canvas) => {
  const webpDataUrl = canvas.toDataURL('image/webp', LOGO_EXPORT_QUALITY)

  return webpDataUrl.startsWith('data:image/webp')
    ? webpDataUrl
    : canvas.toDataURL('image/png')
}

const readImageFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Image could not be opened.'))
    reader.readAsDataURL(file)
  })

const loadImageElement = (source) =>
  new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image could not be opened.'))
    image.src = source
  })

const exportImageDataUrl = (canvas, quality) => {
  const webpDataUrl = canvas.toDataURL('image/webp', quality)

  return webpDataUrl.startsWith('data:image/webp')
    ? webpDataUrl
    : canvas.toDataURL('image/png')
}

const createCompressedImageDataUrl = async (file, maxSize) => {
  if (!file) {
    return ''
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file.')
  }

  if (file.size > IMAGE_MAX_FILE_SIZE) {
    throw new Error('Choose an image under 6 MB.')
  }

  const source = await readImageFileAsDataUrl(file)
  const image = await loadImageElement(source)
  const sourceMax = Math.max(image.naturalWidth, image.naturalHeight)
  const fitScale = sourceMax > maxSize ? maxSize / sourceMax : 1
  const fittedWidth = Math.max(1, Math.round(image.naturalWidth * fitScale))
  const fittedHeight = Math.max(1, Math.round(image.naturalHeight * fitScale))
  let fallbackDataUrl = source

  for (const sizeScale of IMAGE_OUTPUT_SCALES) {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Image could not be prepared.')
    }

    canvas.width = Math.max(1, Math.round(fittedWidth * sizeScale))
    canvas.height = Math.max(1, Math.round(fittedHeight * sizeScale))
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    for (const quality of IMAGE_EXPORT_QUALITIES) {
      const dataUrl = exportImageDataUrl(canvas, quality)
      fallbackDataUrl = dataUrl

      if (dataUrl.length <= IMAGE_UPLOAD_MAX_DATA_URL_LENGTH) {
        return dataUrl
      }
    }
  }

  return fallbackDataUrl
}

const getLogoCropMetrics = (imageSize, scale, offset) => {
  if (!imageSize?.width || !imageSize?.height) {
    return null
  }

  const baseScale = Math.max(
    LOGO_CROP_FRAME_SIZE / imageSize.width,
    LOGO_CROP_FRAME_SIZE / imageSize.height,
  )
  const displayScale = baseScale * scale
  const width = imageSize.width * displayScale
  const height = imageSize.height * displayScale

  return {
    displayScale,
    height,
    left: (LOGO_CROP_FRAME_SIZE - width) / 2 + offset.x,
    top: (LOGO_CROP_FRAME_SIZE - height) / 2 + offset.y,
    width,
  }
}

const clampLogoCropOffset = (imageSize, scale, offset) => {
  const metrics = getLogoCropMetrics(imageSize, scale, { x: 0, y: 0 })

  if (!metrics) {
    return offset
  }

  const maxX = Math.max(0, (metrics.width - LOGO_CROP_FRAME_SIZE) / 2)
  const maxY = Math.max(0, (metrics.height - LOGO_CROP_FRAME_SIZE) / 2)

  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  }
}

function App() {
  const location = useLocation()
  const activeCafeSlug = getCafeSlugFromPath(location.pathname)
  const isAdminRoute = location.pathname === '/admin' || location.pathname.endsWith('/admin')
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [adminPreviewSettings, setAdminPreviewSettings] = useState(null)
  const [menuItems, setMenuItems] = useState(DEFAULT_MENU_ITEMS)
  const [cart, setCart] = useState(() => readStoredCart(activeCafeSlug))
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [dataIssue, setDataIssue] = useState('')
  const [adminSessionEmail, setAdminSessionEmail] = useState('')
  const navbarSettings = isAdminRoute && adminPreviewSettings
    ? adminPreviewSettings
    : settings

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart],
  )

  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  )

  const themeVars = useMemo(
    () => ({
      '--accent': settings.primary_color,
      '--accent-strong': settings.accent_color,
      '--accent-warm': settings.warm_color,
      '--accent-soft': `${settings.primary_color}24`,
      '--accent-warm-soft': `${settings.warm_color}24`,
    }),
    [settings],
  )

  const refreshPublicData = async (nextCafeSlug = activeCafeSlug) => {
    const cafeSlug = normalizeCafeSlug(nextCafeSlug)
    setLoading(true)
    setDataIssue('')

    if (!isSupabaseConfigured || !supabase) {
      setSettings({ ...DEFAULT_SETTINGS, cafe_slug: cafeSlug })
      setMenuItems(DEFAULT_MENU_ITEMS)
      setDataIssue(supabaseConfigError || 'Add Supabase keys and run supabase/schema.sql for shared menu and order data.')
      setLoading(false)
      return
    }

    const [settingsResult, menuResult] = await Promise.all([
      supabase.rpc('get_public_cafe_settings', { p_cafe_slug: cafeSlug }),
      supabase.rpc('get_public_menu_items', { p_cafe_slug: cafeSlug }),
    ])

    if (settingsResult.error || !settingsResult.data) {
      setSettings({ ...DEFAULT_SETTINGS, cafe_slug: cafeSlug })
      setDataIssue(`Run the updated supabase/schema.sql file. ${normalizeError(settingsResult.error)}`)
    } else {
      setSettings(normalizeSettings(settingsResult.data))
    }

    if (menuResult.error) {
      setMenuItems([])
      setDataIssue(`Menu data needs the updated Supabase SQL. ${normalizeError(menuResult.error)}`)
    } else {
      setMenuItems(Array.isArray(menuResult.data) ? menuResult.data : [])
    }

    setLoading(false)
  }

  const syncAdminData = (nextSettings, nextMenuItems) => {
    setSettings(normalizeSettings(nextSettings))
    setMenuItems((nextMenuItems || []).filter((item) => item.is_available))
  }

  const signOutAdminFromNav = async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }

    setAdminSessionEmail('')
    setMessage('Signed out.')
  }

  const clearCart = () => {
    setCart([])
  }

  const addToCart = (item) => {
    setCart((current) => {
      const found = current.find((cartItem) => cartItem.id === item.id)

      if (found) {
        return current.map((cartItem) =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem,
        )
      }

      return [
        ...current,
        {
          id: item.id,
          name: item.name,
          category: item.category,
          price: Number(item.price),
          image_url: item.image_url,
          quantity: 1,
        },
      ]
    })
  }

  const updateCartQuantity = (id, quantity) => {
    setCart((current) =>
      current
        .map((item) => (item.id === id ? { ...item, quantity: Math.max(0, quantity) } : item))
        .filter((item) => item.quantity > 0),
    )
  }

  useEffect(() => {
    setCart(readStoredCart(activeCafeSlug))
    refreshPublicData(activeCafeSlug)
  }, [activeCafeSlug])

  useEffect(() => {
    updateDocumentBrand(settings)
  }, [settings])

  useEffect(() => {
    localStorage.setItem(getCartKey(activeCafeSlug), JSON.stringify(cart))
  }, [activeCafeSlug, cart])

  useEffect(() => {
    if (!isAdminRoute) {
      setAdminPreviewSettings(null)
    }
  }, [isAdminRoute])

  return (
    <div className="app-shell" style={themeVars}>
      <Navbar
        adminEmail={adminSessionEmail}
        settings={navbarSettings}
        onAdminSignOut={signOutAdminFromNav}
      />

      {message && (
        <button className="app-toast" type="button" onClick={() => setMessage('')}>
          {message}
        </button>
      )}

      <main className="app-main">
        {dataIssue && <DataBanner text={dataIssue} onRefresh={() => refreshPublicData(activeCafeSlug)} />}
        <Routes>
          <Route path="/" element={<Navigate to={getCafePath(DEFAULT_CAFE_SLUG, '/customer')} replace />} />
          <Route path="/customer" element={<Navigate to={getCafePath(DEFAULT_CAFE_SLUG, '/customer')} replace />} />
          <Route path="/checkout" element={<Navigate to={getCafePath(DEFAULT_CAFE_SLUG, '/checkout')} replace />} />
          <Route path="/queue" element={<Navigate to={getCafePath(DEFAULT_CAFE_SLUG, '/queue')} replace />} />
          <Route path="/receipt/:orderId" element={<LegacyReceiptRedirect />} />
          <Route path="/staff" element={<LegacyStaffRedirect />} />
          <Route
            path="/c/:cafeSlug/customer"
            element={
              <CustomerPage
                cart={cart}
                cartCount={cartCount}
                cartTotal={cartTotal}
                cafeSlug={activeCafeSlug}
                items={menuItems}
                loading={loading}
                settings={settings}
                onAddToCart={addToCart}
                onRefresh={() => refreshPublicData(activeCafeSlug)}
                onUpdateCartQuantity={updateCartQuantity}
              />
            }
          />
          <Route
            path="/c/:cafeSlug/checkout"
            element={
              <CheckoutPage
                cart={cart}
                cartTotal={cartTotal}
                cafeSlug={activeCafeSlug}
                clearCart={clearCart}
                settings={settings}
              />
            }
          />
          <Route path="/c/:cafeSlug/queue" element={<OrderQueuePage cafeSlug={activeCafeSlug} />} />
          <Route path="/c/:cafeSlug/receipt/:orderId" element={<ReceiptPage cafeSlug={activeCafeSlug} />} />
          <Route path="/c/:cafeSlug/staff" element={<StaffPage cafeSlug={activeCafeSlug} />} />
          <Route
            path="/admin"
            element={
              <AdminPage
                cafeSlug={null}
                onAdminDataReady={syncAdminData}
                onAdminSessionChange={setAdminSessionEmail}
                onAdminSettingsPreview={setAdminPreviewSettings}
                onPublicRefresh={refreshPublicData}
                onToast={setMessage}
              />
            }
          />
          <Route
            path="/c/:cafeSlug/admin"
            element={
              <AdminPage
                cafeSlug={activeCafeSlug}
                onAdminDataReady={syncAdminData}
                onAdminSessionChange={setAdminSessionEmail}
                onAdminSettingsPreview={setAdminPreviewSettings}
                onPublicRefresh={refreshPublicData}
                onToast={setMessage}
              />
            }
          />
          <Route path="*" element={<Navigate to={getCafePath(DEFAULT_CAFE_SLUG, '/customer')} replace />} />
        </Routes>
      </main>
    </div>
  )
}

function LegacyReceiptRedirect() {
  const { orderId } = useParams()
  const location = useLocation()

  return (
    <Navigate
      to={`${getCafePath(DEFAULT_CAFE_SLUG, `/receipt/${orderId}`)}${location.search}`}
      replace
    />
  )
}

function LegacyStaffRedirect() {
  const location = useLocation()

  return <Navigate to={`${getCafePath(DEFAULT_CAFE_SLUG, '/staff')}${location.search}`} replace />
}

function Navbar({ adminEmail, onAdminSignOut, settings }) {
  const location = useLocation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const toggleRef = useRef(null)
  const lockedScrollYRef = useRef(0)
  const cafeSlug = settings.cafe_slug || getCafeSlugFromPath(location.pathname)
  const staffLink = `${location.pathname}${location.search}`
  const isStaffPage = location.pathname === getCafePath(cafeSlug, '/staff') || location.pathname === '/staff'
  const isAdminPage = location.pathname === getCafePath(cafeSlug, '/admin') || location.pathname === '/admin'
  const isCustomerPage = !isStaffPage && !isAdminPage
  const activeAdminTab = getAdminTabId(new URLSearchParams(location.search).get('tab'))
  const adminBasePath = getCafePath(cafeSlug, '/admin')
  const navItems = [
    { to: getCafePath(cafeSlug, '/customer'), label: 'Menu' },
    ...(isCustomerPage ? [{ to: getCafePath(cafeSlug, '/queue'), label: 'Order Queue' }] : []),
    ...(isStaffPage
      ? [
          { to: staffLink, label: 'Staff' },
          { to: adminBasePath, label: 'Admin' },
        ]
      : []),
  ]

  useEffect(() => {
    if (!isMenuOpen) {
      return undefined
    }

    lockedScrollYRef.current = window.scrollY
    document.body.style.setProperty('--locked-scroll-y', `-${lockedScrollYRef.current}px`)
    document.body.classList.add('nav-cabinet-open')

    return () => {
      document.body.classList.remove('nav-cabinet-open')
      document.body.style.removeProperty('--locked-scroll-y')
      window.scrollTo(0, lockedScrollYRef.current)
    }
  }, [isMenuOpen])

  useEffect(() => {
    setIsMenuOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!isMenuOpen) {
      return undefined
    }

    const handlePointerDown = (event) => {
      const target = event.target

      if (menuRef.current?.contains(target) || toggleRef.current?.contains(target)) {
        return
      }

      setIsMenuOpen(false)
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isMenuOpen])

  const handleLinkClick = () => setIsMenuOpen(false)
  const handleAdminSignOut = () => {
    setIsMenuOpen(false)
    onAdminSignOut?.()
  }

  const showAdminProfile = isAdminPage && adminEmail
  const renderAdminProfileChip = () => (
    <div className="admin-profile-chip">
      <div>
        <small>Signed in</small>
        <strong>{adminEmail}</strong>
      </div>
      <button className="ghost-button action-danger" type="button" onClick={handleAdminSignOut}>
        Sign out
      </button>
    </div>
  )

  return (
    <header className="navbar">
      <Link className="nav-brand" to={getCafePath(cafeSlug, '/customer')} onClick={handleLinkClick}>
        <BrandMark logoUrl={settings.logo_url} name={settings.cafe_name} />
        <span>
          <strong>{settings.cafe_name}</strong>
          <small>{settings.tagline}</small>
        </span>
      </Link>

      <button
        ref={toggleRef}
        className={isMenuOpen ? 'nav-toggle nav-toggle-open' : 'nav-toggle'}
        type="button"
        aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen((open) => !open)}
      >
        <span />
        <span />
        <span />
      </button>

      <button
        className={isMenuOpen ? 'nav-mobile-overlay nav-mobile-overlay-open' : 'nav-mobile-overlay'}
        type="button"
        aria-label="Close navigation menu"
        onClick={handleLinkClick}
      />

      <nav
        ref={menuRef}
        className={isMenuOpen ? 'nav-cabinet nav-cabinet-open' : 'nav-cabinet'}
        aria-label="Main navigation"
      >
        <div className="nav-cabinet-head">
          <BrandMark logoUrl={settings.logo_url} name={settings.cafe_name} />
          <div>
            <strong>{settings.cafe_name}</strong>
            <small>
              {isAdminPage ? 'Admin access menu' : isStaffPage ? 'Staff access menu' : 'Customer access menu'}
            </small>
          </div>
        </div>

        <div className="nav-cabinet-scroll">
          <div className="nav-links">
            {navItems.map((item) => (
              <NavLink key={item.label} to={item.to} onClick={handleLinkClick}>
                {item.label}
              </NavLink>
            ))}
          </div>

          {isAdminPage && (
            <div className="nav-cabinet-section">
              <span>Admin section</span>
              {ADMIN_TABS.map((tab) => (
                <NavLink
                  className={() => (activeAdminTab === tab.id ? 'active' : '')}
                  key={tab.id}
                  to={`${adminBasePath}?tab=${tab.id}`}
                  onClick={handleLinkClick}
                >
                  {tab.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        {showAdminProfile && (
          <div className="nav-cabinet-profile">
            {renderAdminProfileChip()}
          </div>
        )}
      </nav>

      {showAdminProfile && (
        <div className="nav-profile-desktop">
          {renderAdminProfileChip()}
        </div>
      )}
    </header>
  )
}

function BrandMark({ logoUrl, name }) {
  const initials = getBrandInitials(name)

  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [logoUrl])

  if (logoUrl && !imageFailed) {
    return (
      <span className="brand-logo-wrap">
        <span>{initials || 'BG'}</span>
        <img
          className="brand-logo-img"
          src={logoUrl}
          alt={name}
          onError={() => setImageFailed(true)}
        />
      </span>
    )
  }

  return <span className="brand-mark">{initials || 'BG'}</span>
}

function DataBanner({ onRefresh, text }) {
  return (
    <section className="data-banner glass-panel">
      <span>{text}</span>
      <button className="ghost-button" type="button" onClick={onRefresh}>
        Refresh
      </button>
    </section>
  )
}

function CustomerPage({
  cart,
  cartCount,
  cartTotal,
  cafeSlug,
  items,
  loading,
  onAddToCart,
  onRefresh,
  onUpdateCartQuantity,
  settings,
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [cartOpen, setCartOpen] = useState(false)

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(items.map((item) => item.category)))],
    [items],
  )

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return items.filter((item) => {
      const matchesCategory = category === 'All' || item.category === category
      const matchesSearch =
        !normalizedQuery ||
        item.name.toLowerCase().includes(normalizedQuery) ||
        item.description.toLowerCase().includes(normalizedQuery)

      return matchesCategory && matchesSearch
    })
  }, [category, items, query])

  return (
    <section className="page-stack">
      <section className="customer-hero glass-panel">
        <div className="hero-copy">
          <span className="eyebrow">QR ordering</span>
          <h1>{settings.welcome_text}</h1>
          <p>{settings.tagline}</p>
          <div className="hero-actions">
            <a className="primary-button" href="#menu">
              Browse menu
            </a>
            <Link
              className={cartCount ? 'ghost-button' : 'ghost-button disabled'}
              to={getCafePath(cafeSlug, '/checkout')}
            >
              Checkout
            </Link>
          </div>
        </div>
        <div className="hero-media">
          <img src={settings.hero_image_url || fallbackImage('Cafe counter')} alt={settings.cafe_name} />
          <div className="floating-ticket">
            <span>Current cart</span>
            <strong>{cartCount} items</strong>
            <small>{formatPeso(cartTotal)}</small>
          </div>
        </div>
      </section>

      <section className="menu-section" id="menu">
        <div className="page-stack">
          <div className="toolbar glass-panel">
            <label className="search-field">
              Search menu
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Coffee, pasta, cake"
              />
            </label>
            <div className="category-row">
              {categories.map((itemCategory) => (
                <button
                  className={itemCategory === category ? 'chip active' : 'chip'}
                  key={itemCategory}
                  type="button"
                  onClick={() => setCategory(itemCategory)}
                >
                  {itemCategory}
                </button>
              ))}
            </div>
          </div>

          {loading && <div className="glass-panel empty-state">Loading menu</div>}
          {!loading && !visibleItems.length && (
            <EmptyPanel title="No menu items" text="Try another search or category." />
          )}

          <div className="menu-grid">
            {visibleItems.map((item) => (
              <MenuCard key={item.id} item={item} onAddToCart={onAddToCart} />
            ))}
          </div>
        </div>
      </section>

      <FloatingCart
        cart={cart}
        cartCount={cartCount}
        isOpen={cartOpen}
        total={cartTotal}
        onClose={() => setCartOpen(false)}
        onOpen={() => setCartOpen(true)}
        onRefresh={onRefresh}
        onUpdateCartQuantity={onUpdateCartQuantity}
        checkoutPath={getCafePath(cafeSlug, '/checkout')}
      />
    </section>
  )
}

function MenuCard({ item, onAddToCart }) {
  return (
    <article className="menu-card">
      <img src={item.image_url || fallbackImage(item.category)} alt={item.name} />
      <div className="menu-card-body">
        <span>{item.category}</span>
        <h3>{item.name}</h3>
        <p>{item.description}</p>
        <div className="menu-card-footer">
          <strong>{formatPeso(item.price)}</strong>
          <button className="primary-button small" type="button" onClick={() => onAddToCart(item)}>
            Add
          </button>
        </div>
      </div>
    </article>
  )
}

function FloatingCart({
  cart,
  cartCount,
  checkoutPath,
  isOpen,
  onClose,
  onOpen,
  onRefresh,
  onUpdateCartQuantity,
  total,
}) {
  return (
    <>
      <button
        className="floating-cart-button"
        type="button"
        onClick={onOpen}
        aria-expanded={isOpen}
        aria-label={`Open cart with ${cartCount} items`}
      >
        <span className="cart-button-icon" aria-hidden="true">
          <CartIcon />
        </span>
        <span className="cart-button-meta">
          <strong>{cartCount} items</strong>
          <small>{formatPeso(total)}</small>
        </span>
      </button>

      {isOpen && (
        <>
          <button
            className="floating-cart-backdrop"
            type="button"
            aria-label="Close cart"
            onClick={onClose}
          />
          <aside className="glass-panel floating-cart-panel" role="dialog" aria-modal="true" aria-label="Your cart">
            <div className="cart-head">
              <div>
                <span className="eyebrow">Current order</span>
                <h2>Your cart</h2>
              </div>
              <div className="floating-cart-actions">
                <button className="ghost-button small" type="button" onClick={onRefresh}>
                  Refresh
                </button>
                <button className="ghost-button small" type="button" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>

            {cart.length === 0 ? (
              <div className="empty-cart">
                <h3>No items yet</h3>
                <p className="muted">Your selected items will show here.</p>
              </div>
            ) : (
              <div className="cart-list">
                {cart.map((item) => (
                  <div className="cart-item" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{formatPeso(item.price)} each</span>
                    </div>
                    <QuantityStepper
                      quantity={item.quantity}
                      onChange={(quantity) => onUpdateCartQuantity(item.id, quantity)}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="cart-total">
              <span>Total</span>
              <strong>{formatPeso(total)}</strong>
            </div>

            <Link
              className={
                cart.length
                  ? 'primary-button center smooth-action-button cart-checkout-button'
                  : 'primary-button center disabled'
              }
              to={checkoutPath}
              onClick={onClose}
            >
              Checkout
            </Link>
          </aside>
        </>
      )}
    </>
  )
}

function CartIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M5 5h2l1.4 8.2a2 2 0 0 0 2 1.7h5.9a2 2 0 0 0 1.9-1.4L20 8H8" />
      <path d="M10 19.2h.01" />
      <path d="M17 19.2h.01" />
    </svg>
  )
}

function QuantityStepper({ onChange, quantity }) {
  return (
    <div className="quantity-stepper">
      <button type="button" onClick={() => onChange(quantity - 1)} aria-label="Decrease quantity">
        -
      </button>
      <span>{quantity}</span>
      <button type="button" onClick={() => onChange(quantity + 1)} aria-label="Increase quantity">
        +
      </button>
    </div>
  )
}

function CheckoutPage({ cafeSlug, cart, cartTotal, clearCart, settings }) {
  const navigate = useNavigate()
  const enabledPaymentOptions = useMemo(
    () => PAYMENT_OPTIONS.filter((option) => settings[option.enabledKey]),
    [settings],
  )
  const [customerName, setCustomerName] = useState('')
  const [tableNumber, setTableNumber] = useState('')
  const [paymentMethod, setPaymentMethod] = useState(enabledPaymentOptions[0]?.id || 'counter')
  const [paymentForm, setPaymentForm] = useState({ cardName: '', cardNumber: '', gcashNumber: '' })
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!enabledPaymentOptions.some((option) => option.id === paymentMethod)) {
      setPaymentMethod(enabledPaymentOptions[0]?.id || '')
    }
  }, [enabledPaymentOptions, paymentMethod])

  const updatePaymentForm = (field, value) => {
    setPaymentForm((current) => ({ ...current, [field]: value }))
  }

  const placeOrder = async (event) => {
    event.preventDefault()
    setFeedback('')

    if (!cart.length) {
      setFeedback('Add at least one item before checkout.')
      return
    }

    if (settings.require_customer_name && !customerName.trim()) {
      setFeedback('Enter your name before placing the order.')
      return
    }

    if (!paymentMethod) {
      setFeedback('Choose a payment method.')
      return
    }

    if (paymentMethod === 'card' && (!paymentForm.cardName.trim() || !paymentForm.cardNumber.trim())) {
      setFeedback('Enter the card details for the simulated payment.')
      return
    }

    if (paymentMethod === 'gcash' && !paymentForm.gcashNumber.trim()) {
      setFeedback('Enter your GCash number for the simulated payment.')
      return
    }

    if (!supabase) {
      setFeedback(supabaseConfigError || 'Supabase is not connected. Add .env keys and run supabase/schema.sql.')
      return
    }

    setSubmitting(true)

    const payload = {
      customer_name: customerName.trim(),
      table_number: tableNumber.trim(),
      payment_method: paymentMethod,
      items: cart.map((item) => ({
        menu_item_id: item.id,
        quantity: item.quantity,
      })),
    }

    const { data, error } = await supabase.rpc('create_customer_order', {
      p_cafe_slug: cafeSlug,
      payload,
    })
    setSubmitting(false)

    if (error) {
      setFeedback(normalizeError(error))
      return
    }

    saveOrderReference(cafeSlug, {
      id: data.id,
      receipt_token: data.receipt_token,
      order_code: data.order_code,
      customer_name: customerName.trim(),
      total_amount: cartTotal,
    })
    clearCart()
    navigate(`${getCafePath(cafeSlug, `/receipt/${data.id}`)}?token=${encodeURIComponent(data.receipt_token)}`)
  }

  if (!cart.length) {
    return (
      <EmptyPanel
        title="Your cart is empty"
        text="Choose menu items from the menu page before checkout."
        action={<Link className="primary-button" to={getCafePath(cafeSlug, '/customer')}>Back to menu</Link>}
      />
    )
  }

  return (
    <section className="checkout-page">
      <HeroPanel
        eyebrow="Checkout"
        title="Add your name and choose payment."
        text={settings.counter_instructions}
      />

      <form className="checkout-layout" onSubmit={placeOrder}>
        <div className="glass-panel checkout-methods">
          <div className="form-section">
            <h2>Customer details</h2>
            <label>
              Customer name
              <input
                required={settings.require_customer_name}
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Your name"
              />
            </label>
            <label>
              Table number
              <input
                value={tableNumber}
                onChange={(event) => setTableNumber(event.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>

          <div className="form-section">
            <h2>Payment method</h2>
            <div className="payment-grid">
              {enabledPaymentOptions.map((option) => (
                <label
                  className={paymentMethod === option.id ? 'payment-option active' : 'payment-option'}
                  key={option.id}
                >
                  <input
                    checked={paymentMethod === option.id}
                    name="paymentMethod"
                    type="radio"
                    value={option.id}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.helper}</small>
                  </span>
                </label>
              ))}
            </div>

            {paymentMethod === 'card' && (
              <div className="payment-fields">
                <label>
                  Card name
                  <input
                    required
                    value={paymentForm.cardName}
                    onChange={(event) => updatePaymentForm('cardName', event.target.value)}
                    placeholder="Name on card"
                  />
                </label>
                <label>
                  Card number
                  <input
                    required
                    inputMode="numeric"
                    value={paymentForm.cardNumber}
                    onChange={(event) => updatePaymentForm('cardNumber', event.target.value)}
                    placeholder="4242 4242 4242 4242"
                  />
                </label>
              </div>
            )}

            {paymentMethod === 'gcash' && (
              <div className="payment-fields">
                <label>
                  GCash mobile number
                  <input
                    required
                    inputMode="tel"
                    value={paymentForm.gcashNumber}
                    onChange={(event) => updatePaymentForm('gcashNumber', event.target.value)}
                    placeholder="09XX XXX XXXX"
                  />
                </label>
                <p className="counter-note">Cafe GCash number: {settings.gcash_number}</p>
              </div>
            )}

            {paymentMethod === 'counter' && <p className="counter-note">{settings.counter_instructions}</p>}
          </div>
        </div>

        <OrderSummary
          backPath={getCafePath(cafeSlug, '/customer')}
          cart={cart}
          feedback={feedback}
          submitting={submitting}
          total={cartTotal}
        />
      </form>
    </section>
  )
}

function OrderSummary({ backPath, cart, feedback, submitting, total }) {
  return (
    <aside className="glass-panel order-summary">
      <h2>Order summary</h2>
      <div className="cart-list">
        {cart.map((item) => (
          <div className="summary-row" key={item.id}>
            <span>
              {item.quantity} x {item.name}
            </span>
            <strong>{formatPeso(item.price * item.quantity)}</strong>
          </div>
        ))}
      </div>
      <div className="cart-total">
        <span>Total</span>
        <strong>{formatPeso(total)}</strong>
      </div>
      {feedback && <p className="form-feedback error">{feedback}</p>}
      <button className="primary-button" disabled={submitting || !cart.length} type="submit">
        {submitting ? 'Creating order' : 'Place order'}
      </button>
      <Link className="ghost-button center" to={backPath}>
        Back to menu
      </Link>
    </aside>
  )
}

function ReceiptPage({ cafeSlug }) {
  const { orderId } = useParams()
  const location = useLocation()
  const token = new URLSearchParams(location.search).get('token')
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState('')

  const fetchOrder = async () => {
    setLoading(true)
    setFeedback('')

    if (!token) {
      setFeedback('Receipt token is missing.')
      setLoading(false)
      return
    }

    if (!supabase) {
      setFeedback(supabaseConfigError || 'Supabase is not connected.')
      setLoading(false)
      return
    }

    const { data, error } = await supabase.rpc('get_order_receipt', {
      p_cafe_slug: cafeSlug,
      p_order_id: orderId,
      p_receipt_token: token,
    })
    setLoading(false)

    if (error) {
      setFeedback(normalizeError(error))
      return
    }

    setOrder(data)
    saveOrderReference(cafeSlug, { ...data, receipt_token: token })
  }

  useEffect(() => {
    fetchOrder()
  }, [orderId, token])

  if (loading) {
    return <LoadingScreen text="Finding your receipt" />
  }

  if (!order) {
    return <EmptyPanel title="Receipt unavailable" text={feedback || 'Order was not found.'} />
  }

  return (
    <section className="receipt-page">
      <div className="receipt-card glass-panel">
        <span className="eyebrow">Order created</span>
        <h1>{order.order_code}</h1>
        <p>
          {order.payment_method === 'counter'
            ? 'Show this order code at the counter.'
            : 'Your simulated payment is marked as paid.'}
        </p>

        <div className="receipt-grid">
          <InfoTile label="Name" value={order.customer_name} />
          <InfoTile label="Payment" value={order.payment_status.replaceAll('_', ' ')} />
          <InfoTile label="Status" value={order.order_status} />
          <InfoTile label="Total" value={formatPeso(order.total_amount)} />
          <InfoTile label="Method" value={order.payment_method} />
          <InfoTile label="Table" value={order.table_number || 'None'} />
        </div>

        <div className="receipt-items">
          {order.items?.map((item) => (
            <div className="summary-row" key={item.id}>
              <span>
                {item.quantity} x {item.item_name}
              </span>
              <strong>{formatPeso(item.line_total)}</strong>
            </div>
          ))}
        </div>

        <div className="button-row">
          <Link className="primary-button" to={getCafePath(cafeSlug, '/customer')}>
            Order more
          </Link>
        </div>
      </div>
    </section>
  )
}

function OrderQueuePage({ cafeSlug }) {
  const [savedOrders, setSavedOrders] = useState(() => readStoredOrderRefs(cafeSlug))
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState('')

  const refreshQueue = async () => {
    const storedOrders = readStoredOrderRefs(cafeSlug)
    setSavedOrders(storedOrders)

    if (!storedOrders.length) {
      setOrders([])
      setFeedback('')
      setLoading(false)
      return
    }

    if (!supabase) {
      setOrders(
        storedOrders.map((order) => ({
          ...order,
          customer_name: order.customer_name || 'Customer',
          order_status: 'unavailable',
          payment_status: 'unknown',
          payment_method: 'unknown',
          total_amount: order.total_amount || 0,
          items: [],
          unavailable: supabaseConfigError || 'Supabase is not connected.',
        })),
      )
      setFeedback(supabaseConfigError || 'Supabase is not connected. Add .env keys and run the SQL setup file.')
      setLoading(false)
      return
    }

    setLoading(true)
    setFeedback('')

    const nextOrders = await Promise.all(
      storedOrders.map(async (order) => {
        const { data, error } = await supabase.rpc('get_order_receipt', {
          p_cafe_slug: cafeSlug,
          p_order_id: order.id,
          p_receipt_token: order.receipt_token,
        })

        if (error) {
          return {
            ...order,
            customer_name: order.customer_name || 'Customer',
            order_status: 'unavailable',
            payment_status: 'unknown',
            payment_method: 'unknown',
            total_amount: order.total_amount || 0,
            items: [],
            unavailable: normalizeError(error),
          }
        }

        return { ...data, receipt_token: order.receipt_token }
      }),
    )

    setOrders(nextOrders)
    setLoading(false)
  }

  useEffect(() => {
    refreshQueue()

    const refreshTimer = window.setInterval(refreshQueue, 10000)

    return () => {
      window.clearInterval(refreshTimer)
    }
  }, [cafeSlug])

  const removeSavedOrder = (orderId) => {
    const nextSavedOrders = removeOrderReference(cafeSlug, orderId)
    setSavedOrders(nextSavedOrders)
    setOrders((currentOrders) => currentOrders.filter((order) => order.id !== orderId))
  }

  return (
    <section className="page-stack">
      <HeroPanel
        eyebrow="Order queue"
        title="Track your order status."
        text="This queue saves orders from this browser and refreshes their live counter status."
      />

      <div className="toolbar glass-panel queue-toolbar">
        <span>
          {savedOrders.length} saved {savedOrders.length === 1 ? 'order' : 'orders'}
        </span>
        <button className="ghost-button" type="button" onClick={refreshQueue}>
          Refresh queue
        </button>
      </div>

      {feedback && <div className="glass-panel empty-state">{feedback}</div>}
      {loading && <div className="glass-panel empty-state">Refreshing order queue</div>}
      {!loading && !savedOrders.length && (
        <EmptyPanel
          title="No orders saved"
          text="Place an order first. Your queue will show order status from this browser."
          action={<Link className="primary-button" to={getCafePath(cafeSlug, '/customer')}>Go to menu</Link>}
        />
      )}

      <div className="order-list">
        {orders.map((order) => (
          <OrderTicket key={order.id} order={order}>
            {order.unavailable && <p className="form-feedback error">{order.unavailable}</p>}
            <div className="button-row queue-card-actions">
              <Link
                className="primary-button"
                to={`${getCafePath(cafeSlug, `/receipt/${order.id}`)}?token=${encodeURIComponent(order.receipt_token)}`}
              >
                Open receipt
              </Link>
              <button className="ghost-button action-danger" type="button" onClick={() => removeSavedOrder(order.id)}>
                Remove
              </button>
            </div>
          </OrderTicket>
        ))}
      </div>
    </section>
  )
}

function StaffPage({ cafeSlug }) {
  const location = useLocation()
  const accessCode = new URLSearchParams(location.search).get('access') || ''
  const [orders, setOrders] = useState([])
  const [filter, setFilter] = useState('active')
  const [orderSearch, setOrderSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState('')

  const fetchOrders = async () => {
    if (!accessCode) {
      setFeedback('Staff access code is missing. Open the staff QR link from admin mode.')
      return
    }

    if (!supabase) {
      setFeedback(supabaseConfigError || 'Supabase is not connected.')
      return
    }

    setLoading(true)
    const { data, error } = await supabase.rpc('staff_list_orders', {
      p_cafe_slug: cafeSlug,
      p_staff_access_code: accessCode,
    })
    setLoading(false)

    if (error) {
      setFeedback(normalizeError(error))
      setOrders([])
      return
    }

    setFeedback('')
    setOrders(data || [])
  }

  useEffect(() => {
    fetchOrders()

    const refreshTimer = window.setInterval(fetchOrders, 10000)

    return () => {
      window.clearInterval(refreshTimer)
    }
  }, [accessCode, cafeSlug])

  const updateStatus = async (orderId, status) => {
    if (!supabase) {
      setFeedback(supabaseConfigError || 'Supabase is not connected.')
      return
    }

    const { error } = await supabase.rpc('staff_update_order_status', {
      p_cafe_slug: cafeSlug,
      p_staff_access_code: accessCode,
      p_order_id: orderId,
      p_status: status,
    })

    if (error) {
      setFeedback(normalizeError(error))
      return
    }

    await fetchOrders()
  }

  const orderSearchQuery = orderSearch.trim().toLowerCase()
  const matchesOrderSearch = (order) => {
    if (!orderSearchQuery) {
      return true
    }

    return [
      order.order_code,
      order.id,
      order.customer_name,
      order.table_number,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(orderSearchQuery))
  }

  const statusFilteredOrders = orders.filter((order) => {
    if (filter === 'active') {
      return ['pending', 'preparing', 'ready'].includes(order.order_status)
    }

    return order.order_status === filter
  })
  const visibleOrders = orderSearchQuery
    ? orders.filter(matchesOrderSearch)
    : statusFilteredOrders

  return (
    <section className="page-stack">
      <HeroPanel
        eyebrow="Staff QR"
        title="Counter queue"
        text="Move tickets through pending, preparing, ready, completed, or cancelled."
      />

      <div className="toolbar glass-panel">
        <label className="search-field staff-order-search">
          Search order
          <input
            value={orderSearch}
            onChange={(event) => setOrderSearch(event.target.value)}
            placeholder="BG-20260514 or customer name"
          />
        </label>
        <div className="category-row">
          {['active', ...STATUS_OPTIONS].map((status) => (
            <button
              className={status === filter ? 'chip active' : 'chip'}
              key={status}
              type="button"
              onClick={() => setFilter(status)}
            >
              {status}
            </button>
          ))}
        </div>
        <button className="ghost-button" type="button" onClick={fetchOrders}>
          Refresh queue
        </button>
      </div>

      {feedback && <div className="glass-panel empty-state">{feedback}</div>}
      {loading && <div className="glass-panel empty-state">Loading counter orders</div>}
      {!loading && !visibleOrders.length && !feedback && (
        <EmptyPanel
          title={orderSearchQuery ? 'No matching ticket' : 'No tickets here'}
          text={orderSearchQuery ? 'Check the order code or customer name.' : 'New orders will show in this view.'}
        />
      )}

      <div className="staff-grid">
        {visibleOrders.map((order) => (
          <OrderTicket key={order.id} order={order} onUpdateStatus={updateStatus} staff />
        ))}
      </div>
    </section>
  )
}

function AdminPage({
  cafeSlug,
  onAdminDataReady,
  onAdminSessionChange,
  onAdminSettingsPreview,
  onPublicRefresh,
  onToast,
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [adminCredentials, setAdminCredentials] = useState({ email: '', password: '' })
  const [authReady, setAuthReady] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [activeTab, setActiveTab] = useState(() =>
    getAdminTabId(new URLSearchParams(location.search).get('tab')),
  )
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [menuItems, setMenuItems] = useState([])
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [menuForm, setMenuForm] = useState(EMPTY_MENU_FORM)
  const [editingMenuId, setEditingMenuId] = useState(null)

  useEffect(() => {
    setActiveTab(getAdminTabId(new URLSearchParams(location.search).get('tab')))
  }, [location.search])

  const changeAdminTab = (tabId) => {
    const nextTab = getAdminTabId(tabId)
    const adminSlug = settings.cafe_slug || cafeSlug || DEFAULT_CAFE_SLUG
    setActiveTab(nextTab)
    navigate(`${getCafePath(adminSlug, '/admin')}?tab=${nextTab}`, { replace: true })
  }

  const updateAdminCredentials = (field, value) => {
    setAdminCredentials((current) => ({ ...current, [field]: value }))
  }

  const applyAdminData = (payload) => {
    const nextSettings = normalizeSettings(payload?.settings || payload)
    const nextMenu = payload?.menu_items || []
    const nextSlug = nextSettings.cafe_slug || cafeSlug || DEFAULT_CAFE_SLUG
    setSettings(nextSettings)
    setMenuItems(nextMenu)
    onAdminSettingsPreview(nextSettings)
    onAdminDataReady(nextSettings, nextMenu)

    if (location.pathname !== getCafePath(nextSlug, '/admin')) {
      navigate(`${getCafePath(nextSlug, '/admin')}?tab=${activeTab}`, { replace: true })
    }
  }

  const refreshAdmin = async () => {
    if (!supabase) {
      setFeedback(supabaseConfigError || 'Supabase is not connected.')
      return false
    }

    const { data, error } = await supabase.rpc('admin_get_settings')

    if (error) {
      setFeedback(normalizeError(error))
      return false
    }

    applyAdminData(data)
    setFeedback('')
    return true
  }

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      return undefined
    }

    let active = true

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()

      if (!active) {
        return
      }

      onAdminSessionChange(data.session?.user?.email || '')

      if (data.session) {
        const opened = await refreshAdmin()
        if (active) {
          setUnlocked(opened)
        }
      }

      if (active) {
        setAuthReady(true)
      }
    }

    loadSession()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      onAdminSessionChange(session?.user?.email || '')

      if (!session) {
        setUnlocked(false)
      }
    })

    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  const unlockAdmin = async (event) => {
    event.preventDefault()

    if (!adminCredentials.email.trim() || !adminCredentials.password) {
      setFeedback('Enter the admin email and password.')
      return
    }

    if (!supabase) {
      setFeedback(supabaseConfigError || 'Supabase is not connected.')
      return
    }

    setSaving(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: adminCredentials.email.trim(),
      password: adminCredentials.password,
    })

    if (error) {
      setSaving(false)
      setFeedback(normalizeError(error))
      return
    }

    setAdminCredentials((current) => ({ ...current, password: '' }))
    const opened = await refreshAdmin()
    setSaving(false)
    setUnlocked(opened)
  }

  const updateSetting = (field, value) => {
    setSettings((current) => {
      const nextSettings = normalizeSettings({ ...current, [field]: value })
      onAdminSettingsPreview(nextSettings)
      return nextSettings
    })
  }

  const saveSettings = async (event) => {
    event.preventDefault()

    if (!supabase) {
      setFeedback(supabaseConfigError || 'Supabase is not connected.')
      return
    }

    const payload = {
      cafe_name: settings.cafe_name,
      tagline: settings.tagline,
      welcome_text: settings.welcome_text,
      logo_url: settings.logo_url,
      hero_image_url: settings.hero_image_url,
      primary_color: settings.primary_color,
      accent_color: settings.accent_color,
      warm_color: settings.warm_color,
      enable_card: settings.enable_card,
      enable_gcash: settings.enable_gcash,
      enable_counter: settings.enable_counter,
      gcash_number: settings.gcash_number,
      order_prefix: settings.order_prefix,
      require_customer_name: settings.require_customer_name,
      counter_instructions: settings.counter_instructions,
    }

    setSaving(true)
    const { error } = await supabase.rpc('admin_update_settings', { payload })
    setSaving(false)

    if (error) {
      setFeedback(normalizeError(error))
      return
    }

    setFeedback('Settings saved.')
    await refreshAdmin()
    await onPublicRefresh(settings.cafe_slug || cafeSlug || DEFAULT_CAFE_SLUG)
  }

  const updateMenuForm = (field, value) => {
    setMenuForm((current) => ({ ...current, [field]: value }))
  }

  const resetMenuForm = () => {
    setEditingMenuId(null)
    setMenuForm(EMPTY_MENU_FORM)
  }

  const editMenuItem = (item) => {
    setEditingMenuId(item.id)
    setMenuForm({
      name: item.name,
      description: item.description,
      category: item.category,
      price: String(item.price),
      image_url: item.image_url || '',
      is_available: item.is_available,
    })
    changeAdminTab('menu')
  }

  const saveMenuItem = async (event) => {
    event.preventDefault()

    if (!supabase) {
      setFeedback(supabaseConfigError || 'Supabase is not connected.')
      return
    }

    const payload = {
      id: editingMenuId,
      name: menuForm.name,
      description: menuForm.description,
      category: menuForm.category,
      price: Number(menuForm.price),
      image_url: menuForm.image_url,
      is_available: menuForm.is_available,
    }

    setSaving(true)
    const { error } = await supabase.rpc('admin_save_menu_item', { payload })
    setSaving(false)

    if (error) {
      setFeedback(normalizeError(error))
      return
    }

    setFeedback(editingMenuId ? 'Menu item updated.' : 'Menu item added.')
    resetMenuForm()
    await refreshAdmin()
    await onPublicRefresh(settings.cafe_slug || cafeSlug || DEFAULT_CAFE_SLUG)
  }

  const toggleMenuItem = async (item) => {
    if (!supabase) {
      setFeedback(supabaseConfigError || 'Supabase is not connected.')
      return
    }

    const { error } = await supabase.rpc('admin_toggle_menu_item', {
      p_item_id: item.id,
      p_is_available: !item.is_available,
    })

    if (error) {
      setFeedback(normalizeError(error))
      return
    }

    await refreshAdmin()
    await onPublicRefresh(settings.cafe_slug || cafeSlug || DEFAULT_CAFE_SLUG)
  }

  const deleteMenuItem = async (item) => {
    if (!supabase) {
      setFeedback(supabaseConfigError || 'Supabase is not connected.')
      return
    }

    setSaving(true)
    const { error } = await supabase.rpc('admin_delete_menu_item', {
      p_item_id: item.id,
    })
    setSaving(false)

    if (error) {
      setFeedback(normalizeError(error))
      return
    }

    if (editingMenuId === item.id) {
      resetMenuForm()
    }

    setFeedback('Menu item deleted.')
    await refreshAdmin()
    await onPublicRefresh(settings.cafe_slug || cafeSlug || DEFAULT_CAFE_SLUG)
  }

  const rotateStaffCode = async () => {
    if (!supabase) {
      setFeedback(supabaseConfigError || 'Supabase is not connected.')
      return
    }

    const { error } = await supabase.rpc('admin_rotate_staff_code')

    if (error) {
      setFeedback(normalizeError(error))
      return
    }

    setFeedback('Staff QR code rotated.')
    await refreshAdmin()
  }

  const copyLink = async (link) => {
    try {
      await navigator.clipboard.writeText(link)
      onToast('QR link copied.')
    } catch {
      onToast(link)
    }
  }

  if (!authReady) {
    return <LoadingScreen text="Checking admin session" />
  }

  if (!unlocked) {
    return (
      <section className="pin-screen">
        <form className="auth-card pin-card" onSubmit={unlockAdmin}>
          <span className="eyebrow">Admin mode</span>
          <h1>Admin login</h1>
          <p>Use the Supabase Auth account assigned to this cafe.</p>
          <label>
            Email
            <input
              autoComplete="email"
              value={adminCredentials.email}
              onChange={(event) => updateAdminCredentials('email', event.target.value)}
              type="email"
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              value={adminCredentials.password}
              onChange={(event) => updateAdminCredentials('password', event.target.value)}
              type="password"
            />
          </label>
          {feedback && <p className="form-feedback error">{feedback}</p>}
          <button className="primary-button" disabled={saving} type="submit">
            {saving ? 'Signing in' : 'Open admin'}
          </button>
        </form>
      </section>
    )
  }

  return (
    <section className="admin-shell">
      <HeroPanel
        eyebrow="Admin mode"
        title="Set up this cafe app."
        text="Change the cafe details, menu, payment options, order rules, and QR links."
      />

      <AdminTabNavigation activeTab={activeTab} onChangeTab={changeAdminTab} />

      {feedback && <div className="glass-panel empty-state">{feedback}</div>}

      {['details', 'theme', 'payments', 'orders'].includes(activeTab) && (
        <form className="glass-panel admin-tab-panel" onSubmit={saveSettings}>
          {activeTab === 'details' && (
            <DetailsTab settings={settings} updateSetting={updateSetting} />
          )}
          {activeTab === 'theme' && <ThemeTab settings={settings} updateSetting={updateSetting} />}
          {activeTab === 'payments' && (
            <PaymentsTab settings={settings} updateSetting={updateSetting} />
          )}
          {activeTab === 'orders' && (
            <OrderSettingsTab
              settings={settings}
              updateSetting={updateSetting}
            />
          )}
          <div className="button-row">
            <button
              className="primary-button admin-compact-button smooth-action-button save-settings-button"
              disabled={saving}
              type="submit"
            >
              {saving ? 'Saving' : 'Save settings'}
            </button>
          </div>
        </form>
      )}

      {activeTab === 'menu' && (
        <MenuAdminTab
          editingMenuId={editingMenuId}
          form={menuForm}
          items={menuItems}
          saving={saving}
          onDelete={deleteMenuItem}
          onEdit={editMenuItem}
          onReset={resetMenuForm}
          onSave={saveMenuItem}
          onToggle={toggleMenuItem}
          onUpdateForm={updateMenuForm}
        />
      )}

      {activeTab === 'qr' && (
        <QrTab
          settings={settings}
          onCopyLink={copyLink}
          onRotateStaffCode={rotateStaffCode}
        />
      )}
    </section>
  )
}

function AdminTabNavigation({ activeTab, onChangeTab }) {
  return (
    <div className="admin-tabs admin-tabs-desktop glass-panel">
      {ADMIN_TABS.map((tab) => (
        <button
          className={activeTab === tab.id ? 'chip active' : 'chip'}
          key={tab.id}
          type="button"
          onClick={() => onChangeTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function DetailsTab({ settings, updateSetting }) {
  const fileInputRef = useRef(null)
  const heroFileInputRef = useRef(null)
  const dragRef = useRef(null)
  const [heroImageFeedback, setHeroImageFeedback] = useState({ text: '', tone: '' })
  const [logoCrop, setLogoCrop] = useState({
    error: '',
    imageSize: null,
    offset: { x: 0, y: 0 },
    scale: 1,
    source: '',
  })

  const logoCropMetrics = getLogoCropMetrics(logoCrop.imageSize, logoCrop.scale, logoCrop.offset)
  const logoCropImageStyle = logoCropMetrics
    ? {
        height: `${logoCropMetrics.height}px`,
        left: `${logoCropMetrics.left}px`,
        top: `${logoCropMetrics.top}px`,
        width: `${logoCropMetrics.width}px`,
      }
    : {}

  const closeLogoCrop = () => {
    setLogoCrop({
      error: '',
      imageSize: null,
      offset: { x: 0, y: 0 },
      scale: 1,
      source: '',
    })
    dragRef.current = null
  }

  const chooseLogoFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setLogoCrop((current) => ({ ...current, error: 'Choose an image file.' }))
      return
    }

    if (file.size > LOGO_MAX_FILE_SIZE) {
      setLogoCrop((current) => ({ ...current, error: 'Choose an image under 6 MB.' }))
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      setLogoCrop({
        error: '',
        imageSize: null,
        offset: { x: 0, y: 0 },
        scale: 1,
        source: String(reader.result || ''),
      })
    }

    reader.onerror = () => {
      setLogoCrop((current) => ({ ...current, error: 'Image could not be opened.' }))
    }

    reader.readAsDataURL(file)
  }

  const chooseHeroImageFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    setHeroImageFeedback({ text: 'Preparing hero image.', tone: '' })

    try {
      const nextImage = await createCompressedImageDataUrl(file, HERO_IMAGE_OUTPUT_SIZE)
      updateSetting('hero_image_url', nextImage)
      setHeroImageFeedback({ text: 'Hero image ready. Save settings to publish.', tone: 'success' })
    } catch (error) {
      setHeroImageFeedback({ text: error.message || 'Hero image could not be opened.', tone: 'error' })
    }
  }

  const handleLogoImageLoad = (event) => {
    const imageSize = {
      height: event.currentTarget.naturalHeight,
      width: event.currentTarget.naturalWidth,
    }

    setLogoCrop((current) => ({
      ...current,
      imageSize,
      offset: clampLogoCropOffset(imageSize, current.scale, { x: 0, y: 0 }),
    }))
  }

  const updateLogoScale = (value) => {
    const nextScale = Number(value)

    setLogoCrop((current) => ({
      ...current,
      offset: clampLogoCropOffset(current.imageSize, nextScale, current.offset),
      scale: nextScale,
    }))
  }

  const startLogoDrag = (event) => {
    if (!logoCrop.imageSize) {
      return
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startOffset: logoCrop.offset,
      startX: event.clientX,
      startY: event.clientY,
    }
  }

  const moveLogoDrag = (event) => {
    const drag = dragRef.current

    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }

    const nextOffset = {
      x: drag.startOffset.x + event.clientX - drag.startX,
      y: drag.startOffset.y + event.clientY - drag.startY,
    }

    setLogoCrop((current) => ({
      ...current,
      offset: clampLogoCropOffset(current.imageSize, current.scale, nextOffset),
    }))
  }

  const endLogoDrag = (event) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }

  const applyLogoCrop = () => {
    if (!logoCrop.source || !logoCrop.imageSize || !logoCropMetrics) {
      setLogoCrop((current) => ({ ...current, error: 'Wait for the image preview to load.' }))
      return
    }

    const image = new Image()

    image.onload = () => {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')

      if (!context) {
        setLogoCrop((current) => ({ ...current, error: 'Logo could not be cropped.' }))
        return
      }

      const sourceWidth = LOGO_CROP_FRAME_SIZE / logoCropMetrics.displayScale
      const sourceHeight = LOGO_CROP_FRAME_SIZE / logoCropMetrics.displayScale
      const sourceX = Math.min(
        image.naturalWidth - sourceWidth,
        Math.max(0, -logoCropMetrics.left / logoCropMetrics.displayScale),
      )
      const sourceY = Math.min(
        image.naturalHeight - sourceHeight,
        Math.max(0, -logoCropMetrics.top / logoCropMetrics.displayScale),
      )

      canvas.width = LOGO_OUTPUT_SIZE
      canvas.height = LOGO_OUTPUT_SIZE
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        LOGO_OUTPUT_SIZE,
        LOGO_OUTPUT_SIZE,
      )

      updateSetting('logo_url', createLogoDataUrl(canvas))
      closeLogoCrop()
    }

    image.onerror = () => {
      setLogoCrop((current) => ({ ...current, error: 'Logo could not be cropped.' }))
    }

    image.src = logoCrop.source
  }

  return (
    <div className="settings-grid">
      <label>
        Cafe name
        <input value={settings.cafe_name} onChange={(event) => updateSetting('cafe_name', event.target.value)} />
      </label>
      <label>
        Tagline
        <input value={settings.tagline} onChange={(event) => updateSetting('tagline', event.target.value)} />
      </label>
      <label className="wide">
        Welcome text
        <textarea
          value={settings.welcome_text}
          onChange={(event) => updateSetting('welcome_text', event.target.value)}
        />
      </label>
      <div className="logo-upload-field">
        <span className="field-label">Logo image</span>
        <div className="logo-upload-card">
          <BrandMark logoUrl={settings.logo_url} name={settings.cafe_name} />
          <div>
            <strong>{settings.logo_url ? 'Logo ready' : 'No logo selected'}</strong>
            <small>Choose an image, crop the square logo, then save a compressed version.</small>
          </div>
        </div>
        <input
          ref={fileInputRef}
          accept="image/*"
          className="file-input-hidden"
          type="file"
          onChange={chooseLogoFile}
        />
        <div className="button-row logo-upload-actions">
          <button
            className="primary-button admin-compact-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose image
          </button>
          <button
            className="ghost-button admin-compact-button action-danger"
            type="button"
            onClick={() => updateSetting('logo_url', '')}
          >
            Remove logo
          </button>
        </div>
      </div>
      <div className="image-upload-field wide">
        <label>
          Hero image
          <input
            value={settings.hero_image_url || ''}
            onChange={(event) => {
              setHeroImageFeedback({ text: '', tone: '' })
              updateSetting('hero_image_url', event.target.value)
            }}
          />
        </label>
        {settings.hero_image_url && (
          <div className="image-upload-preview hero-image-preview">
            <img src={settings.hero_image_url} alt="Hero preview" />
          </div>
        )}
        <input
          ref={heroFileInputRef}
          accept="image/*"
          className="file-input-hidden"
          type="file"
          onChange={chooseHeroImageFile}
        />
        <div className="button-row image-upload-actions">
          <button
            className="primary-button admin-compact-button"
            type="button"
            onClick={() => heroFileInputRef.current?.click()}
          >
            Choose image
          </button>
          <button
            className="ghost-button admin-compact-button action-danger"
            type="button"
            onClick={() => {
              setHeroImageFeedback({ text: '', tone: '' })
              updateSetting('hero_image_url', '')
            }}
          >
            Remove image
          </button>
        </div>
        {heroImageFeedback.text && (
          <p className={`form-feedback ${heroImageFeedback.tone}`}>{heroImageFeedback.text}</p>
        )}
      </div>

      {logoCrop.source && (
        <div className="crop-modal-backdrop" role="presentation">
          <section className="crop-modal glass-panel" role="dialog" aria-modal="true" aria-label="Crop logo">
            <div>
              <span className="eyebrow">Logo crop</span>
              <h2>Crop your logo</h2>
              <p>Drag the image inside the fixed square box.</p>
            </div>

            <div
              className="logo-crop-frame"
              role="presentation"
              onPointerCancel={endLogoDrag}
              onPointerDown={startLogoDrag}
              onPointerMove={moveLogoDrag}
              onPointerUp={endLogoDrag}
            >
              <img
                alt=""
                draggable="false"
                src={logoCrop.source}
                style={logoCropImageStyle}
                onLoad={handleLogoImageLoad}
              />
              <span className="logo-crop-guide" />
            </div>

            <label className="crop-slider">
              Zoom
              <input
                max="3"
                min="1"
                step="0.01"
                type="range"
                value={logoCrop.scale}
                onChange={(event) => updateLogoScale(event.target.value)}
              />
            </label>

            {logoCrop.error && <p className="form-feedback error">{logoCrop.error}</p>}

            <div className="button-row crop-actions">
              <button className="primary-button" type="button" onClick={applyLogoCrop}>
                Use cropped logo
              </button>
              <button className="ghost-button action-danger" type="button" onClick={closeLogoCrop}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function ThemeTab({ settings, updateSetting }) {
  return (
    <div className="settings-grid">
      <ColorField
        label="Main color"
        value={settings.primary_color}
        onChange={(value) => updateSetting('primary_color', value)}
      />
      <ColorField
        label="Accent color"
        value={settings.accent_color}
        onChange={(value) => updateSetting('accent_color', value)}
      />
      <ColorField
        label="Warm color"
        value={settings.warm_color}
        onChange={(value) => updateSetting('warm_color', value)}
      />
    </div>
  )
}

function ColorField({ label, onChange, value }) {
  return (
    <label>
      {label}
      <span className="color-input">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      </span>
    </label>
  )
}

function PaymentsTab({ settings, updateSetting }) {
  return (
    <div className="settings-grid">
      <label className="check-row">
        <input
          checked={settings.enable_card}
          type="checkbox"
          onChange={(event) => updateSetting('enable_card', event.target.checked)}
        />
        Enable Card
      </label>
      <label className="check-row">
        <input
          checked={settings.enable_gcash}
          type="checkbox"
          onChange={(event) => updateSetting('enable_gcash', event.target.checked)}
        />
        Enable GCash
      </label>
      <label className="check-row">
        <input
          checked={settings.enable_counter}
          type="checkbox"
          onChange={(event) => updateSetting('enable_counter', event.target.checked)}
        />
        Enable Counter
      </label>
      <label>
        GCash display number
        <input
          value={settings.gcash_number}
          onChange={(event) => updateSetting('gcash_number', event.target.value)}
        />
      </label>
    </div>
  )
}

function OrderSettingsTab({ settings, updateSetting }) {
  return (
    <div className="settings-grid">
      <label>
        Order prefix
        <input
          maxLength={8}
          value={settings.order_prefix}
          onChange={(event) => updateSetting('order_prefix', event.target.value)}
        />
      </label>
      <label className="check-row">
        <input
          checked={settings.require_customer_name}
          type="checkbox"
          onChange={(event) => updateSetting('require_customer_name', event.target.checked)}
        />
        Require customer name
      </label>
      <label className="wide">
        Counter instructions
        <textarea
          maxLength={260}
          value={settings.counter_instructions}
          onChange={(event) => updateSetting('counter_instructions', event.target.value)}
        />
      </label>
    </div>
  )
}

function MenuAdminTab({
  editingMenuId,
  form,
  items,
  onDelete,
  onEdit,
  onReset,
  onSave,
  onToggle,
  onUpdateForm,
  saving,
}) {
  const imageInputRef = useRef(null)
  const [imageFeedback, setImageFeedback] = useState({ text: '', tone: '' })
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)

  useEffect(() => {
    setImageFeedback({ text: '', tone: '' })
  }, [editingMenuId])

  useEffect(() => {
    setDeleteConfirmId(null)
  }, [items])

  const chooseMenuImageFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    setImageFeedback({ text: 'Preparing menu image.', tone: '' })

    try {
      const nextImage = await createCompressedImageDataUrl(file, MENU_IMAGE_OUTPUT_SIZE)
      onUpdateForm('image_url', nextImage)
      setImageFeedback({ text: 'Menu image ready. Save the item to publish.', tone: 'success' })
    } catch (error) {
      setImageFeedback({ text: error.message || 'Menu image could not be opened.', tone: 'error' })
    }
  }

  const deleteItem = async (item) => {
    await onDelete(item)
    setDeleteConfirmId(null)
  }

  const renderMenuForm = (isEditing) => (
    <form className={isEditing ? 'glass-panel menu-form menu-edit-modal' : 'glass-panel menu-form'} onSubmit={onSave}>
      <span className="eyebrow">Menu editor</span>
      <h2>{isEditing ? 'Edit item' : 'Add item'}</h2>
      <label>
        Item name
        <input required value={form.name} onChange={(event) => onUpdateForm('name', event.target.value)} />
      </label>
      <label>
        Description
        <textarea
          required
          value={form.description}
          onChange={(event) => onUpdateForm('description', event.target.value)}
        />
      </label>
      <label>
        Category
        <input required value={form.category} onChange={(event) => onUpdateForm('category', event.target.value)} />
      </label>
      <label>
        Price
        <input
          required
          min="1"
          step="0.01"
          type="number"
          value={form.price}
          onChange={(event) => onUpdateForm('price', event.target.value)}
        />
      </label>
      <div className="image-upload-field">
        <label>
          Product image
          <input
            value={form.image_url}
            onChange={(event) => {
              setImageFeedback({ text: '', tone: '' })
              onUpdateForm('image_url', event.target.value)
            }}
          />
        </label>
        {form.image_url && (
          <div className="image-upload-preview menu-image-preview">
            <img src={form.image_url} alt="Menu preview" />
          </div>
        )}
        <input
          ref={imageInputRef}
          accept="image/*"
          className="file-input-hidden"
          type="file"
          onChange={chooseMenuImageFile}
        />
        <div className="button-row image-upload-actions">
          <button
            className="primary-button admin-compact-button"
            type="button"
            onClick={() => imageInputRef.current?.click()}
          >
            Choose image
          </button>
          <button
            className="ghost-button admin-compact-button action-danger"
            type="button"
            onClick={() => {
              setImageFeedback({ text: '', tone: '' })
              onUpdateForm('image_url', '')
            }}
          >
            Remove image
          </button>
        </div>
        {imageFeedback.text && (
          <p className={`form-feedback ${imageFeedback.tone}`}>{imageFeedback.text}</p>
        )}
      </div>
      <label className="check-row">
        <input
          checked={form.is_available}
          type="checkbox"
          onChange={(event) => onUpdateForm('is_available', event.target.checked)}
        />
        Available for customers
      </label>
      <button className="primary-button admin-compact-button" disabled={saving} type="submit">
        {saving ? 'Saving' : isEditing ? 'Update menu item' : 'Add menu item'}
      </button>
      {isEditing && (
        <button className="ghost-button center admin-compact-button action-danger" type="button" onClick={onReset}>
          Cancel edit
        </button>
      )}
    </form>
  )

  return (
    <section className={editingMenuId ? 'admin-layout menu-editing-layout' : 'admin-layout'}>
      {!editingMenuId && renderMenuForm(false)}

      {editingMenuId && (
        <div className="menu-edit-backdrop" role="presentation">
          <div role="dialog" aria-modal="true" aria-label="Edit menu item">
            {renderMenuForm(true)}
          </div>
        </div>
      )}

      <div className="admin-menu-list">
        {items.map((item) => (
          <article className={item.is_available ? 'admin-menu-card' : 'admin-menu-card disabled'} key={item.id}>
            <img src={item.image_url || fallbackImage(item.category)} alt={item.name} />
            <div>
              <span>{item.category}</span>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <strong>{formatPeso(item.price)}</strong>
            </div>
            <div className="button-column">
              <button className="ghost-button" type="button" onClick={() => onEdit(item)}>
                Edit
              </button>
              <button
                className={item.is_available ? 'ghost-button action-warning' : 'ghost-button action-success'}
                disabled={saving}
                type="button"
                onClick={() => onToggle(item)}
              >
                {item.is_available ? 'Disable' : 'Enable'}
              </button>
              {deleteConfirmId === item.id ? (
                <div className="menu-delete-confirm">
                  <button
                    className="ghost-button action-danger"
                    disabled={saving}
                    type="button"
                    onClick={() => deleteItem(item)}
                  >
                    Confirm delete
                  </button>
                  <button className="ghost-button" type="button" onClick={() => setDeleteConfirmId(null)}>
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  className="ghost-button action-danger"
                  disabled={saving}
                  type="button"
                  onClick={() => setDeleteConfirmId(item.id)}
                >
                  Delete
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function QrTab({ onCopyLink, onRotateStaffCode, settings }) {
  const cafeSlug = settings.cafe_slug || DEFAULT_CAFE_SLUG
  const customerLink = getHashUrl(getCafePath(cafeSlug, '/customer'))
  const staffLink = getHashUrl(`${getCafePath(cafeSlug, '/staff')}?access=${encodeURIComponent(settings.staff_access_code || '')}`)
  const adminLink = getHashUrl(getCafePath(cafeSlug, '/admin'))

  return (
    <section className="qr-tab">
      <div className="qr-grid">
        <QrCard label="Customer QR" link={customerLink} onCopyLink={onCopyLink} />
        <QrCard label="Staff QR" link={staffLink} onCopyLink={onCopyLink} />
        <QrCard label="Admin QR" link={adminLink} onCopyLink={onCopyLink} />
      </div>
      <div className="glass-panel access-panel">
        <div>
          <span className="eyebrow">Staff access</span>
          <h2>{settings.staff_access_code || 'No staff code yet'}</h2>
          <p>Rotate the code when you want old staff QR links to stop working.</p>
        </div>
        <div className="button-row">
          <button className="ghost-button" type="button" onClick={onRotateStaffCode}>
            Rotate staff QR
          </button>
          <button className="primary-button" type="button" onClick={() => window.print()}>
            Print QR codes
          </button>
        </div>
      </div>
    </section>
  )
}

function QrCard({ label, link, onCopyLink }) {
  return (
    <article className="qr-card glass-panel">
      <h2>{label}</h2>
      <QRCodeCanvas value={link} size={178} level="H" includeMargin />
      <div className="link-field">{link}</div>
      <button className="ghost-button center" type="button" onClick={() => onCopyLink(link)}>
        Copy link
      </button>
    </article>
  )
}

function LoadingScreen({ text }) {
  return (
    <main className="setup-screen">
      <section className="setup-card glass-panel">
        <span className="eyebrow">BizGrowth Cafe</span>
        <h1>{text}</h1>
      </section>
    </main>
  )
}

function HeroPanel({ eyebrow, text, title }) {
  return (
    <section className="hero-panel">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{text}</p>
    </section>
  )
}

function EmptyPanel({ action, text, title }) {
  return (
    <section className="glass-panel empty-state">
      <h2>{title}</h2>
      <p>{text}</p>
      {action && <div className="button-row center-row">{action}</div>}
    </section>
  )
}

function InfoTile({ label, value }) {
  return (
    <div className="info-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function OrderTicket({ children, onUpdateStatus, order, staff = false }) {
  return (
    <article className={staff ? 'order-ticket staff-ticket glass-panel' : 'order-ticket glass-panel'}>
      <div className={staff ? 'ticket-head staff-ticket-head' : 'ticket-head'}>
        <div className={staff ? 'staff-ticket-customer' : undefined}>
          <span className="eyebrow">{order.order_code}</span>
          <h2>{order.customer_name}</h2>
          <small>{formatOrderTime(order.created_at)}</small>
        </div>
        <span className={`status-badge ${order.order_status}`}>{order.order_status}</span>
      </div>

      <div className={staff ? 'receipt-grid staff-ticket-details' : 'receipt-grid'}>
        <InfoTile label="Payment" value={String(order.payment_status || '').replaceAll('_', ' ')} />
        <InfoTile label="Method" value={order.payment_method} />
        <InfoTile label="Total" value={formatPeso(order.total_amount)} />
        <InfoTile label="Table" value={order.table_number || 'None'} />
      </div>

      <div className={staff ? 'receipt-items staff-ticket-items' : 'receipt-items'}>
        {order.items?.map((item) => (
          <div className={staff ? 'summary-row staff-ticket-item' : 'summary-row'} key={item.id}>
            <span>
              {item.quantity} x {item.item_name}
            </span>
            <strong>{formatPeso(item.line_total)}</strong>
          </div>
        ))}
      </div>

      {staff && (
        <div className="status-actions staff-status-actions">
          {STATUS_OPTIONS.map((status) => (
            <button
              className={[
                'chip',
                `status-action-${status}`,
                order.order_status === status ? 'active' : '',
              ].filter(Boolean).join(' ')}
              disabled={order.order_status === status}
              key={status}
              type="button"
              onClick={() => onUpdateStatus(order.id, status)}
            >
              {status}
            </button>
          ))}
        </div>
      )}

      {children}
    </article>
  )
}

function formatOrderTime(value) {
  if (!value) {
    return ''
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function fallbackImage(category = 'Cafe') {
  const encoded = encodeURIComponent(`${category} cafe food`)
  return `https://source.unsplash.com/700x520/?${encoded}`
}

export default App
