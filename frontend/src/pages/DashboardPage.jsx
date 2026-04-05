import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CalendarMonthView from '../components/CalendarMonthView'
import EmptyState from '../components/EmptyState'
import ErrorAlert from '../components/ErrorAlert'
import FieldInput from '../components/FieldInput'
import FoodScanPanel from '../components/FoodScanPanel'
import ImageWithFallback from '../components/ImageWithFallback'
import MetricCard from '../components/MetricCard'
import MovieRecommendationCard from '../components/MovieRecommendationCard'
import SongRecommendationCard from '../components/SongRecommendationCard'
import {
  fetchCalendarDay,
  fetchCalendarHistory,
  fetchUpcomingPlans,
  saveCalendarPlan,
} from '../services/api/calendarApi'
import { fetchDashboardSummary } from '../services/api/dashboardApi'
import {
  fetchContentRecommendations,
  fetchSavedContent,
  saveContentForLater,
  sendContentFeedback,
} from '../services/api/contentApi'
import { buildMealPlan } from '../services/api/mealBuilderApi'
import { addMeal, deleteMeal, updateMeal } from '../services/api/mealApi'
import { shareViaEmail } from '../services/api/shareApi'
import { deleteExerciseSession, updateExerciseSession } from '../services/api/exerciseApi'
import { normalizeApiError } from '../services/api/client'
import useAuth from '../hooks/useAuth'

function todayDateKey() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(iso) {
  if (!iso) {
    return ''
  }

  return new Date(iso).toLocaleString()
}

function isFutureDate(dateKey) {
  return dateKey > todayDateKey()
}

function toMonthDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function macroProgress(consumed, target) {
  const safeConsumed = Number(consumed || 0)
  const safeTarget = Number(target || 0)
  return `${safeConsumed.toFixed(1)} / ${safeTarget.toFixed(1)} g`
}

function parseIngredientList(input) {
  return String(input || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

const ATHENS_FALLBACK = {
  lat: '33.9519',
  lng: '-83.3576',
}

function fallbackImage(title, subtitle, tone = 'restaurant') {
  const colorA = tone === 'food' ? '#f59e0b' : '#0ea5e9'
  const colorB = tone === 'food' ? '#facc15' : '#22d3ee'

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="${colorA}"/><stop offset="100%" stop-color="${colorB}"/></linearGradient></defs><rect width="800" height="500" fill="url(#g)"/><circle cx="80" cy="80" r="90" fill="rgba(255,255,255,0.2)"/><circle cx="720" cy="420" r="120" fill="rgba(255,255,255,0.15)"/><rect x="56" y="184" width="688" height="146" rx="20" fill="rgba(14,24,38,0.32)"/><text x="400" y="246" text-anchor="middle" font-size="48" font-family="Outfit, Arial, sans-serif" fill="white" font-weight="700">${String(title || '').slice(0, 24)}</text><text x="400" y="286" text-anchor="middle" font-size="24" font-family="Outfit, Arial, sans-serif" fill="#ecfeff">${String(subtitle || '').slice(0, 34)}</text></svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function ingredientLine(item) {
  if (!item) {
    return ''
  }

  if (typeof item === 'string') {
    return item
  }

  const amount = item.amount || item.quantity || ''
  return amount ? `${amount} ${item.name}` : item.name
}

function featurePercent(feature) {
  const pct = Number(feature?.contributionPct)
  if (Number.isFinite(pct)) {
    return Math.max(0, Math.min(100, Math.round(pct)))
  }

  const raw = Number(feature?.contribution || 0)
  if (!Number.isFinite(raw) || raw <= 0) {
    return 0
  }

  if (raw > 1) {
    return Math.max(0, Math.min(100, Math.round(raw)))
  }

  return Math.max(0, Math.min(100, Math.round(raw * 100)))
}

function buildFallbackDashboardState() {
  return {
    today: {
      caloriesConsumed: 0,
      caloriesBurned: 0,
      netIntake: 0,
      proteinConsumed: 0,
      carbsConsumed: 0,
      fatsConsumed: 0,
      fiberConsumed: 0,
      proteinTarget: 140,
      carbsTarget: 220,
      fatsTarget: 70,
      fiberTarget: 30,
      remainingCalories: 2200,
      remainingProtein: 140,
      remainingCarbs: 220,
      remainingFats: 70,
      remainingFiber: 30,
      workoutsToday: 0,
      stepsToday: 0,
    },
    recommendedForRemainingDay: {
      message: 'Recommendations unavailable right now.',
      restaurantOptions: [],
      mealBuilder: [],
      recipes: [],
    },
    contentRecommendations: {
      whileEating: { recommendations: [] },
      walkingMusic: { recommendations: [] },
      workoutMusic: { recommendations: [] },
    },
    aiInsights: {
      bestNextAction: 'Log a meal to begin personalization.',
      whyThisWasRecommended: 'Fallback dashboard data is currently active.',
      behaviorInsight: 'Behavior trends will appear after more activity.',
      anomalyInsight: 'No anomaly signal available in fallback mode.',
      confidencePct: 50,
    },
  }
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [dashboard, setDashboard] = useState(null)
  const [calendarHistory, setCalendarHistory] = useState([])
  const [upcomingPlans, setUpcomingPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [contentFeed, setContentFeed] = useState({ movies: [], songs: [] })
  const [contentLearning, setContentLearning] = useState(null)
  const [savedContent, setSavedContent] = useState([])
  const [isContentLoading, setIsContentLoading] = useState(true)
  const [isSavedContentLoading, setIsSavedContentLoading] = useState(true)
  const [contentError, setContentError] = useState('')

  const [selectedDate, setSelectedDate] = useState(todayDateKey())
  const [selectedDay, setSelectedDay] = useState(null)
  const [isDayLoading, setIsDayLoading] = useState(false)
  const [activeMonth, setActiveMonth] = useState(toMonthDate(todayDateKey()))

  const [plannedCalories, setPlannedCalories] = useState('')
  const [planNote, setPlanNote] = useState('')
  const [isCheatDay, setIsCheatDay] = useState(false)
  const [isSavingPlan, setIsSavingPlan] = useState(false)

  const [mealPlanMode, setMealPlanMode] = useState('eat-out')
  const [eatOutMode, setEatOutMode] = useState('delivery')
  const [eatInMode, setEatInMode] = useState('have')
  const [homeIngredientsInput, setHomeIngredientsInput] = useState('')
  const [generatedMealPlans, setGeneratedMealPlans] = useState([])
  const [isGeneratingMealPlan, setIsGeneratingMealPlan] = useState(false)
  const [decisionLocation, setDecisionLocation] = useState({
    lat: ATHENS_FALLBACK.lat,
    lng: ATHENS_FALLBACK.lng,
    radius: '8',
  })
  const [isLocatingDecision, setIsLocatingDecision] = useState(false)
  const [locationStatus, setLocationStatus] = useState(
    'Using Athens, Georgia as default location.'
  )
  const [editingMeal, setEditingMeal] = useState(null)
  const [editingExercise, setEditingExercise] = useState(null)
  const [shareEmail, setShareEmail] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const [isSharingDay, setIsSharingDay] = useState(false)
  const [panelState, setPanelState] = useState({
    recommendations: true,
    insights: true,
    saved: true,
    history: true,
  })

  const loadDashboard = useCallback(async () => {
    try {
      const data = await fetchDashboardSummary()
      if (!data || typeof data !== 'object') {
        throw new Error('Dashboard payload was empty')
      }
      setDashboard(data)
      return data
    } catch (apiError) {
      setDashboard((prev) => prev || buildFallbackDashboardState())
      throw apiError
    }
  }, [])

  const loadCalendarMeta = useCallback(async () => {
    const [history, upcoming] = await Promise.all([
      fetchCalendarHistory(4),
      fetchUpcomingPlans(),
    ])

    setCalendarHistory(history.days || [])
    setUpcomingPlans(upcoming.plans || [])
  }, [])

  const loadContent = useCallback(async () => {
    setIsContentLoading(true)
    setContentError('')

    try {
      const data = await fetchContentRecommendations()
      setContentFeed({
        movies: Array.isArray(data?.movies) ? data.movies : [],
        songs: Array.isArray(data?.songs) ? data.songs : [],
      })
      setContentLearning(data?.learning || null)
    } catch (apiError) {
      setContentFeed({ movies: [], songs: [] })
      setContentLearning(null)
      setContentError(normalizeApiError(apiError))
    } finally {
      setIsContentLoading(false)
    }
  }, [])

  const loadSavedContent = useCallback(async () => {
    setIsSavedContentLoading(true)

    try {
      const data = await fetchSavedContent({ limit: 20 })
      setSavedContent(Array.isArray(data?.items) ? data.items : [])
    } catch {
      setSavedContent([])
    } finally {
      setIsSavedContentLoading(false)
    }
  }, [])

  const loadInitial = useCallback(async () => {
    setLoading(true)
    setError('')

    const results = await Promise.allSettled([
      loadDashboard(),
      loadCalendarMeta(),
      loadContent(),
      loadSavedContent(),
    ])

    const failed = results.find((item) => item.status === 'rejected')
    if (failed) {
      setError(normalizeApiError(failed.reason))
    }

    setLoading(false)
  }, [loadCalendarMeta, loadContent, loadDashboard, loadSavedContent])

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  useEffect(() => {
    const loadDay = async () => {
      try {
        setIsDayLoading(true)
        const data = await fetchCalendarDay(selectedDate)
        setSelectedDay(data)
        setPlannedCalories(data?.plan?.plannedCalories ? String(data.plan.plannedCalories) : '')
        setPlanNote(data?.plan?.note || '')
        setIsCheatDay(Boolean(data?.plan?.isCheatDay))
      } catch (apiError) {
        setError(normalizeApiError(apiError))
      } finally {
        setIsDayLoading(false)
      }
    }

    if (selectedDate) {
      loadDay()
    }
  }, [selectedDate])

  const today = dashboard?.today
  const recommendation = dashboard?.recommendedForRemainingDay
  const contentRecommendations = useMemo(
    () => dashboard?.contentRecommendations || {},
    [dashboard?.contentRecommendations]
  )
  const aiInsights = dashboard?.aiInsights
  const mealBuilderSuggestions = recommendation?.mealBuilder || []
  const recipeSuggestions = recommendation?.recipes || []
  const ingredientDrivenPlans = generatedMealPlans.length ? generatedMealPlans : mealBuilderSuggestions

  const marksByDate = useMemo(() => {
    const map = {}

    calendarHistory.forEach((day) => {
      map[day.date] = {
        ...(map[day.date] || {}),
        hasHistory: true,
        hasPlan: Boolean(day.plannedCalories),
        isCheatDay: Boolean(day.isCheatDay),
      }
    })

    upcomingPlans.forEach((plan) => {
      map[plan.date] = {
        ...(map[plan.date] || {}),
        hasPlan: true,
        isCheatDay: Boolean(plan.isCheatDay || Number(plan.expectedExtraCalories || 0) > 0),
      }
    })

    const todayKey = todayDateKey()
    map[todayKey] = {
      ...(map[todayKey] || {}),
      isToday: true,
    }

    return map
  }, [calendarHistory, upcomingPlans])

  const topRestaurantOptions = useMemo(
    () => (recommendation?.restaurantOptions || []).slice(0, 5),
    [recommendation]
  )
  const dedupeContentItems = useCallback((items = []) => {
    const deduped = []
    const seen = new Set()
    items.forEach((item) => {
      const key = item?.id || `${item?.type || ''}:${item?.title || ''}:${item?.artist || ''}`
      if (!key || seen.has(key)) {
        return
      }
      seen.add(key)
      deduped.push(item)
    })
    return deduped
  }, [])

  const movieRecommendations = useMemo(() => {
    if (contentFeed.movies.length) {
      return dedupeContentItems(contentFeed.movies)
    }

    return dedupeContentItems((contentRecommendations?.whileEating?.recommendations || []).map((item) => ({
      ...item,
      type: item.type || 'movie',
      contextType: item.context?.contextType || 'eat_in',
    })))
  }, [contentFeed.movies, contentRecommendations, dedupeContentItems])

  const songRecommendations = useMemo(() => {
    if (contentFeed.songs.length) {
      return dedupeContentItems(contentFeed.songs).map((item) => ({
        ...item,
        type: 'song',
        contextType: item.contextType || item.context?.contextType || 'walking',
      }))
    }

    const fallbackSongs = [
      ...(contentRecommendations?.walkingMusic?.recommendations || []),
      ...(contentRecommendations?.workoutMusic?.recommendations || []),
    ]

    return dedupeContentItems(fallbackSongs).map((item) => ({
        ...item,
        type: 'song',
        contextType: item.context?.contextType || 'walking',
      }))
  }, [contentFeed.songs, contentRecommendations, dedupeContentItems])
  const todayKey = todayDateKey()
  const selectedIsToday = selectedDate === todayKey
  const selectedIsPast = selectedDate < todayKey

  const togglePanel = (key) => {
    setPanelState((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleFeatureCardClick = (target) => {
    if (target === 'eat-out') {
      setMealPlanMode('eat-out')
      setPanelState((prev) => ({ ...prev, recommendations: true }))
      return
    }

    if (target === 'eat-in') {
      setMealPlanMode('eat-in')
      setPanelState((prev) => ({ ...prev, recommendations: true }))
      return
    }

    if (target === 'scan') {
      setMealPlanMode('scan')
      setPanelState((prev) => ({ ...prev, recommendations: true }))
      return
    }

    if (target === 'exercise') {
      navigate('/exercise')
      return
    }

    if (target === 'movies') {
      setPanelState((prev) => ({ ...prev, recommendations: true }))
      document.getElementById('dashboard-movies-section')?.scrollIntoView({ behavior: 'smooth' })
      return
    }

    if (target === 'songs') {
      setPanelState((prev) => ({ ...prev, recommendations: true }))
      document.getElementById('dashboard-songs-section')?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const applyAthensFallback = useCallback((message) => {
    setDecisionLocation((prev) => ({
      ...prev,
      lat: ATHENS_FALLBACK.lat,
      lng: ATHENS_FALLBACK.lng,
    }))
    setLocationStatus(message || 'Using Athens, Georgia as default location.')
  }, [])

  const handleUseDecisionLocation = useCallback(({ silent = false } = {}) => {
    if (!navigator.geolocation) {
      applyAthensFallback('Geolocation unavailable. Using Athens, Georgia coordinates.')
      if (!silent) {
        setError('Geolocation is not available in this browser.')
      }
      return
    }

    if (!silent) {
      setError('')
    }
    setIsLocatingDecision(true)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDecisionLocation((prev) => ({
          ...prev,
          lat: position.coords.latitude.toFixed(6),
          lng: position.coords.longitude.toFixed(6),
        }))
        setLocationStatus('Using your current location for nearby ranking and scan resolution.')
        setIsLocatingDecision(false)
      },
      () => {
        applyAthensFallback('Location permission denied. Using Athens, Georgia coordinates.')
        if (!silent) {
          setError('Unable to access your location. You can continue with Athens fallback.')
        }
        setIsLocatingDecision(false)
      }
    )
  }, [applyAthensFallback])

  useEffect(() => {
    if (!navigator.geolocation || !navigator.permissions?.query) {
      return
    }

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        if (result.state === 'granted') {
          handleUseDecisionLocation({ silent: true })
        }
      })
      .catch(() => {})
  }, [handleUseDecisionLocation])

  const handleDateSelect = (dateKey) => {
    setSelectedDate(dateKey)
    setActiveMonth(toMonthDate(dateKey))
  }

  const handleMonthChange = (delta) => {
    setActiveMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  const handleSavePlan = async () => {
    setError('')
    setStatus('')

    if (!selectedDate || !plannedCalories) {
      setError('Choose a date and planned calories first.')
      return
    }

    try {
      setIsSavingPlan(true)
      const data = await saveCalendarPlan({
        date: selectedDate,
        plannedCalories: Number(plannedCalories),
        isCheatDay,
        note: planNote,
      })

      setStatus(data.recommendation?.message || 'Plan saved.')
      await Promise.all([loadDashboard(), loadCalendarMeta()])
      const dayData = await fetchCalendarDay(selectedDate)
      setSelectedDay(dayData)
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setIsSavingPlan(false)
    }
  }

  const handleAddSuggestionAsMeal = async (suggestion) => {
    setError('')
    setStatus('')

    try {
      await addMeal({
        foodName: suggestion.recipe?.recipeName || suggestion.ingredients?.map((item) => item.name).join(' + '),
        calories: suggestion.macroTotals?.calories || 0,
        protein: suggestion.macroTotals?.protein || 0,
        carbs: suggestion.macroTotals?.carbs || 0,
        fats: suggestion.macroTotals?.fats || 0,
        fiber: suggestion.macroTotals?.fiber || 0,
        sourceType: 'recipe',
        source: 'recipe',
        mealType: 'dinner',
        ingredients: (suggestion.ingredients || []).map((item) => item.name),
        allergyWarnings: suggestion.allergyWarnings || [],
      })

      setStatus('Meal suggestion added to today intake.')
      await loadDashboard()
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleGenerateMealPlanFromIngredients = async () => {
    setError('')
    setStatus('')

    const ingredientFocus = parseIngredientList(homeIngredientsInput)
    if (!ingredientFocus.length) {
      setError('Add at least one ingredient (comma-separated) to build a meal.')
      return
    }

    try {
      setIsGeneratingMealPlan(true)
      const data = await buildMealPlan({
        ingredientFocus,
        maxSuggestions: 3,
      })
      setGeneratedMealPlans(data.suggestions || [])
      setStatus('Generated meal ideas from your available ingredients.')
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setIsGeneratingMealPlan(false)
    }
  }

  const handleAddRecipeCardAsMeal = async (recipe) => {
    setError('')
    setStatus('')

    try {
      await addMeal({
        foodName: recipe.recipeName || 'Recipe Meal',
        calories: recipe.estimatedMacros?.calories || 0,
        protein: recipe.estimatedMacros?.protein || 0,
        carbs: recipe.estimatedMacros?.carbs || 0,
        fats: recipe.estimatedMacros?.fats || 0,
        fiber: recipe.estimatedMacros?.fiber || 0,
        sourceType: 'recipe',
        source: 'recipe',
        mealType: 'dinner',
        ingredients: (recipe.ingredients || []).map((item) =>
          typeof item === 'string' ? item : item.name
        ),
        allergyWarnings: recipe.allergyNotes || [],
      })
      setStatus(`${recipe.recipeName || 'Recipe'} added to today's intake.`)
      await loadDashboard()
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const refreshSelectedDay = async () => {
    const dayData = await fetchCalendarDay(selectedDate)
    setSelectedDay(dayData)
  }

  const handleStartMealEdit = (meal) => {
    setEditingMeal({
      id: meal.id,
      foodName: meal.foodName || '',
      calories: meal.calories || 0,
      protein: meal.protein || 0,
      carbs: meal.carbs || 0,
      fats: meal.fats || 0,
      fiber: meal.fiber || 0,
      portion: meal.portion || 1,
      sourceType: meal.sourceType || meal.source || 'custom',
      mealType: meal.mealType || 'dinner',
      ingredients: meal.ingredients || [],
      allergyWarnings: meal.allergyWarnings || [],
      timestamp: meal.createdAt,
    })
  }

  const handleSaveMealEdit = async () => {
    if (!editingMeal?.id) {
      return
    }

    setError('')
    setStatus('')

    try {
      await updateMeal(editingMeal.id, {
        foodName: editingMeal.foodName,
        calories: Number(editingMeal.calories || 0),
        protein: Number(editingMeal.protein || 0),
        carbs: Number(editingMeal.carbs || 0),
        fats: Number(editingMeal.fats || 0),
        fiber: Number(editingMeal.fiber || 0),
        portion: Number(editingMeal.portion || 1),
        sourceType: editingMeal.sourceType || 'custom',
        mealType: editingMeal.mealType || 'dinner',
        ingredients: editingMeal.ingredients || [],
        allergyWarnings: editingMeal.allergyWarnings || [],
        timestamp: editingMeal.timestamp,
      })
      setEditingMeal(null)
      setStatus('Meal updated successfully.')
      await Promise.all([loadDashboard(), refreshSelectedDay(), loadCalendarMeta()])
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleDeleteMealEntry = async (meal) => {
    setError('')
    setStatus('')

    try {
      await deleteMeal(meal.id)
      if (editingMeal?.id === meal.id) {
        setEditingMeal(null)
      }
      setStatus('Meal deleted successfully.')
      await Promise.all([loadDashboard(), refreshSelectedDay(), loadCalendarMeta()])
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleStartExerciseEdit = (session) => {
    const firstExercise = session.exercises?.[0] || {}
    setEditingExercise({
      id: session.id,
      workoutType: session.workoutType || 'strength',
      exerciseName: firstExercise.name || session.workoutType || 'exercise',
      sets: firstExercise.sets || 0,
      reps: firstExercise.reps || 0,
      weightKg: firstExercise.weightKg || 0,
      durationMinutes: session.durationMinutes || firstExercise.durationMinutes || 0,
      bodyWeightKg: session.bodyWeightKg || 70,
      intensity: firstExercise.intensity || 'moderate',
      steps: session.steps || 0,
      distanceMiles: session.distanceMiles || 0,
      notes: session.notes || '',
      timestamp: session.createdAt,
    })
  }

  const handleSaveExerciseEdit = async () => {
    if (!editingExercise?.id) {
      return
    }

    setError('')
    setStatus('')

    try {
      await updateExerciseSession(editingExercise.id, {
        workoutType: editingExercise.workoutType,
        durationMinutes: Number(editingExercise.durationMinutes || 0),
        bodyWeightKg: Number(editingExercise.bodyWeightKg || 70),
        intensity: editingExercise.intensity || 'moderate',
        steps: Number(editingExercise.steps || 0),
        distanceMiles: Number(editingExercise.distanceMiles || 0),
        notes: editingExercise.notes || '',
        timestamp: editingExercise.timestamp,
        exercises: [
          {
            name: editingExercise.exerciseName || editingExercise.workoutType,
            sets: Number(editingExercise.sets || 0),
            reps: Number(editingExercise.reps || 0),
            weightKg: Number(editingExercise.weightKg || 0),
            durationMinutes: Number(editingExercise.durationMinutes || 0),
            intensity: editingExercise.intensity || 'moderate',
          },
        ],
      })
      setEditingExercise(null)
      setStatus('Exercise updated successfully.')
      await Promise.all([loadDashboard(), refreshSelectedDay(), loadCalendarMeta()])
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleDeleteExerciseEntry = async (session) => {
    setError('')
    setStatus('')

    try {
      await deleteExerciseSession(session.id)
      if (editingExercise?.id === session.id) {
        setEditingExercise(null)
      }
      setStatus('Exercise deleted successfully.')
      await Promise.all([loadDashboard(), refreshSelectedDay(), loadCalendarMeta()])
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleShareSelectedDay = async () => {
    setError('')
    setStatus('')

    if (!shareEmail.trim()) {
      setError('Enter an email address to share this day.')
      return
    }

    try {
      setIsSharingDay(true)
      await shareViaEmail({
        toEmail: shareEmail.trim(),
        type: 'diet',
        content: {
          date: selectedDate,
        },
        message: shareMessage || '',
      })
      setShareMessage('')
      setStatus('Day snapshot shared via email.')
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setIsSharingDay(false)
    }
  }

  const handleContentFeedback = async (item, action, contextType) => {
    if (!item?.id || !contextType) {
      return
    }

    setError('')
    setStatus('')

    try {
      if (action === 'save') {
        const saved = await saveContentForLater({
          itemId: item.id,
          title: item.title,
          contentType: item.type,
          artist: item.artist,
          genre: item.genre,
          mood: item.mood,
          reason: item.reason,
          confidence: item.confidence,
          confidencePct: item.confidencePct,
          sourceUrl: item.sourceUrl,
          contextType,
          features: item.features,
        })

        setSavedContent(Array.isArray(saved?.items) ? saved.items : [])
        setStatus('Saved for later.')
        return
      }

      await sendContentFeedback({
        itemId: item.id,
        title: item.title,
        contentType: item.type,
        contextType,
        action,
        score: item.score,
        confidence: item.confidence,
        reason: item.reason,
        features: item.features,
      })

      if (action === 'not_interested') {
        setContentFeed((prev) => ({
          movies: (prev.movies || []).filter((entry) => entry?.id !== item.id),
          songs: (prev.songs || []).filter((entry) => entry?.id !== item.id),
        }))
        await loadContent()
      }

      setStatus(
        action === 'not_interested'
          ? 'Preference updated. We will avoid similar content in this context.'
          : 'Thanks for the feedback. ContextFit will personalize future content recommendations.'
      )
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const renderPlanTitle = (suggestion) =>
    suggestion.recipe?.recipeName || (suggestion.ingredients || []).map((item) => item.name).join(' + ') || 'Meal Plan'

  if (loading) {
    return <section className="panel">Loading ContextFit command center...</section>
  }

  if (!dashboard || !today) {
    return (
      <section className="page-grid single">
        <article className="panel">
          <h1>Dashboard unavailable</h1>
          <p className="muted">{error || 'Unable to load dashboard right now.'}</p>
          <div className="inline-actions">
            <button className="button" type="button" onClick={loadInitial}>
              Retry
            </button>
            <Link className="button button-ghost" to="/login">
              Re-authenticate
            </Link>
          </div>
        </article>
      </section>
    )
  }

  return (
    <section className="page-grid single">
      <article className="panel panel-hero dashboard-panel">
        <div className="panel-hero-top">
          <div>
            <h1>ContextFit Daily Command Center</h1>
            <p className="muted">
              A context-aware, adaptive, explainable lifestyle intelligence system
            </p>
          </div>
          <div className="inline-actions">
            <Link className="button button-ghost" to="/search">
              Search Nearby Meals
            </Link>
            <Link className="button button-ghost" to="/exercise">
              Exercise Tracker
            </Link>
            <Link className="button button-secondary" to="/history">
              History
            </Link>
          </div>
        </div>

        <div className="dashboard-utility-bar">
          <div className="dashboard-user-block">
            <p className="dashboard-user-label">Signed in as</p>
            <p className="dashboard-user-name">
              {user?.firstName || 'Member'} {user?.lastName || ''}
            </p>
          </div>
          <div className="dashboard-utility-actions">
            <button className="button button-ghost" type="button" onClick={() => setStatus('No new notifications right now.')}>
              Notifications
            </button>
            <Link className="button button-ghost" to="/profile">
              Settings
            </Link>
          </div>
        </div>

        <ErrorAlert message={error} />
        {status ? <p className="status-message">{status}</p> : null}

        <article className="sub-panel section-summary">
          <h2>Today's Nutrition &amp; Activity Summary</h2>
          <p className="helper-note">
            Remaining today: {today.remainingCalories} kcal | Protein {today.remainingProtein}g | Carbs {today.remainingCarbs}g | Fats {today.remainingFats}g | Fiber {today.remainingFiber}g
          </p>
          <div className="metrics-grid">
            <MetricCard label="Calories Consumed" value={`${today.caloriesConsumed} kcal`} />
            <MetricCard label="Calories Burned" value={`${today.caloriesBurned} kcal`} tone="success" />
            <MetricCard label="Net Calories" value={`${today.netIntake} kcal`} tone={today.netIntake > 0 ? 'warning' : 'success'} />
            <MetricCard label="Workouts Today" value={`${today.workoutsToday || 0}`} />
            <MetricCard label="Steps Today" value={`${today.stepsToday || 0}`} />
            <MetricCard label="Protein" value={macroProgress(today.proteinConsumed, today.proteinTarget)} />
            <MetricCard label="Carbs" value={macroProgress(today.carbsConsumed, today.carbsTarget)} />
            <MetricCard label="Fats" value={macroProgress(today.fatsConsumed, today.fatsTarget)} />
            <MetricCard label="Fiber" value={macroProgress(today.fiberConsumed, today.fiberTarget)} />
          </div>
        </article>

        <article className="sub-panel section-feature-grid">
          <h2>Quick Actions</h2>
          <div className="feature-grid">
            <button className="feature-card" type="button" onClick={() => handleFeatureCardClick('eat-out')}>
              <span className="feature-icon">EAT</span>
              <span className="feature-label">Eat Out</span>
            </button>
            <button className="feature-card" type="button" onClick={() => handleFeatureCardClick('eat-in')}>
              <span className="feature-icon">COOK</span>
              <span className="feature-label">Eat In</span>
            </button>
            <button className="feature-card" type="button" onClick={() => handleFeatureCardClick('scan')}>
              <span className="feature-icon">SCAN</span>
              <span className="feature-label">Scan Food</span>
            </button>
            <button className="feature-card" type="button" onClick={() => handleFeatureCardClick('exercise')}>
              <span className="feature-icon">MOVE</span>
              <span className="feature-label">Exercise</span>
            </button>
            <button className="feature-card" type="button" onClick={() => handleFeatureCardClick('movies')}>
              <span className="feature-icon">MOVIE</span>
              <span className="feature-label">Movies</span>
            </button>
            <button className="feature-card" type="button" onClick={() => handleFeatureCardClick('songs')}>
              <span className="feature-icon">SONG</span>
              <span className="feature-label">Songs</span>
            </button>
          </div>
        </article>

        <article className="sub-panel section-decision collapsible-panel">
          <div className="collapse-header">
            <h2>What are you planning for this meal?</h2>
            <button className="button button-ghost collapse-button" type="button" onClick={() => togglePanel('recommendations')}>
              {panelState.recommendations ? 'Hide' : 'Show'}
            </button>
          </div>

          {panelState.recommendations ? (
            <>
              <div className="inline-actions">
            <button
              className={`button ${mealPlanMode === 'eat-out' ? '' : 'button-ghost'}`}
              onClick={() => setMealPlanMode('eat-out')}
            >
              Eat Out
            </button>
            <button
              className={`button ${mealPlanMode === 'eat-in' ? '' : 'button-ghost'}`}
              onClick={() => setMealPlanMode('eat-in')}
            >
              Eat In
            </button>
            <button
              className={`button ${mealPlanMode === 'scan' ? '' : 'button-ghost'}`}
              onClick={() => setMealPlanMode('scan')}
            >
              Scan Food (AI)
            </button>
              </div>

              {mealPlanMode === 'eat-out' ? (
                <div className="sub-panel">
              <div className="inline-actions">
                <button
                  className={`button button-secondary ${eatOutMode === 'delivery' ? '' : 'button-ghost'}`}
                  onClick={() => setEatOutMode('delivery')}
                >
                  Delivery
                </button>
                <button
                  className={`button button-secondary ${eatOutMode === 'pickup' ? '' : 'button-ghost'}`}
                  onClick={() => setEatOutMode('pickup')}
                >
                  Pickup / Go There
                </button>
              </div>
              <p className="helper-note">
                {eatOutMode === 'delivery'
                  ? 'Winner-ranked delivery recommendations based on macros, history, and convenience.'
                  : 'Pickup-focused options ranked by preference fit and travel effort.'}
              </p>

              {topRestaurantOptions.length ? (
                <ul className="activity-list">
                  {topRestaurantOptions.map((item, index) => (
                    <li key={`${item.name}-${index}`} className="activity-item">
                      <div className="result-media">
                        <ImageWithFallback
                          src={item.restaurantImage}
                          fallback={fallbackImage(item.name || 'Restaurant', item.cuisine || 'Cuisine')}
                          alt={item.name || 'Restaurant'}
                          className="result-image"
                        />
                        <ImageWithFallback
                          src={item.foodImage}
                          fallback={fallbackImage(item.suggestedMeal || 'Food', 'Nutrition Ready', 'food')}
                          alt={item.suggestedMeal || 'Food item'}
                          className="result-image result-image-food"
                        />
                      </div>
                      <p>
                        <strong>{item.name}</strong> {item.distance ? `| ${item.distance.toFixed(2)} mi` : ''}
                      </p>
                      <p className="muted">{item.suggestedMeal} | {item.cuisine || 'Cuisine not listed'}</p>
                      <p className="muted">
                        Rating: {Number.isFinite(Number(item.rating)) ? Number(item.rating).toFixed(1) : 'N/A'} | Reviews:{' '}
                        {(item.userRatingsTotal || 0).toLocaleString()}
                      </p>
                      {item.route?.distanceMiles ? (
                        <p className="muted">
                          Distance {Number(item.route.distanceMiles).toFixed(2)} mi | Walk {item.route?.walking?.minutes || 0} min |{' '}
                          {item.route?.walking?.steps || 0} steps | ~{item.route?.walking?.caloriesBurned || 0} kcal burn
                        </p>
                      ) : null}
                      {item.reviewSnippet ? <p className="muted">"{item.reviewSnippet}"</p> : null}
                      {item.nutritionEstimate ? (
                        <p className="muted">
                          {item.nutritionEstimate.calories} kcal | P {item.nutritionEstimate.protein}g | C {item.nutritionEstimate.carbs}g | F {item.nutritionEstimate.fats}g
                        </p>
                      ) : null}
                      {(item.recommendation?.reason || item.recommendation?.message) ? (
                        <p className="muted">
                          Best Choice for You: {item.recommendation?.reason || item.recommendation?.message} (
                          {Math.round(Number(item.recommendation?.confidencePct || item.recommendation?.score || 0))}%)
                        </p>
                      ) : null}
                      {Array.isArray(item.recommendation?.topFeatures) && item.recommendation.topFeatures.length ? (
                        <p className="muted">
                          Top factors:{' '}
                          {item.recommendation.topFeatures
                            .slice(0, 2)
                            .map((feature) =>
                              typeof feature === 'string'
                                ? feature
                                : `${feature.name} (${featurePercent(feature)}%)`
                            )
                            .join(', ')}
                        </p>
                      ) : null}
                      {item.allergyWarnings?.length ? (
                        <p className="allergy-warning">⚠️ {item.allergyWarnings.join(' | ')}</p>
                      ) : null}
                      <div className="actions-grid">
                        {eatOutMode === 'delivery' ? (
                          <>
                            <a className="button button-ghost" href={item.orderLinks?.uberEats} target="_blank" rel="noreferrer">
                              Order on Uber Eats
                            </a>
                            <a className="button button-ghost" href={item.orderLinks?.doorDash} target="_blank" rel="noreferrer">
                              Order on DoorDash
                            </a>
                            <a className="button button-ghost" href={item.viewLink} target="_blank" rel="noreferrer">
                              View on Google
                            </a>
                          </>
                        ) : (
                          <>
                            <a className="button button-ghost" href={item.orderLinks?.uberEats} target="_blank" rel="noreferrer">
                              Order on Uber Eats
                            </a>
                            <a className="button button-ghost" href={item.orderLinks?.doorDash} target="_blank" rel="noreferrer">
                              Order on DoorDash
                            </a>
                            <a className="button button-ghost" href={item.viewLink} target="_blank" rel="noreferrer">
                              View Restaurant
                            </a>
                            <a className="button button-ghost" href={item.visitLink} target="_blank" rel="noreferrer">
                              Open Directions
                            </a>
                            <a className="button button-ghost" href={item.visitLink} target="_blank" rel="noreferrer">
                              Pickup Plan
                            </a>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="No restaurant suggestions"
                  description="Use Search to generate nearby options."
                  actionLabel="Open Search"
                  actionTo="/search"
                />
              )}

            </div>
          ) : mealPlanMode === 'eat-in' ? (
            <div className="sub-panel">
              <div className="inline-actions">
                <button
                  className={`button button-secondary ${eatInMode === 'have' ? '' : 'button-ghost'}`}
                  onClick={() => setEatInMode('have')}
                >
                  Use Ingredients I Have
                </button>
                <button
                  className={`button button-secondary ${eatInMode === 'order' ? '' : 'button-ghost'}`}
                  onClick={() => setEatInMode('order')}
                >
                  Order Ingredients
                </button>
                <button
                  className={`button button-secondary ${eatInMode === 'recipes' ? '' : 'button-ghost'}`}
                  onClick={() => setEatInMode('recipes')}
                >
                  Quick Recipe Suggestions
                </button>
              </div>

              {eatInMode === 'have' ? (
                <>
                  <div className="split-two">
                    <label className="field">
                      <span className="field-label">Ingredients You Already Have</span>
                      <input
                        className="field-control"
                        type="text"
                        placeholder="chicken, rice, eggs, oats, vegetables"
                        value={homeIngredientsInput}
                        onChange={(event) => setHomeIngredientsInput(event.target.value)}
                      />
                    </label>
                    <button
                      className="button button-align-end"
                      onClick={handleGenerateMealPlanFromIngredients}
                      disabled={isGeneratingMealPlan}
                    >
                      {isGeneratingMealPlan ? 'Generating...' : 'Build from My Ingredients'}
                    </button>
                  </div>
                  {(generatedMealPlans.length ? generatedMealPlans : ingredientDrivenPlans).length ? (
                    <ul className="activity-list">
                      {(generatedMealPlans.length ? generatedMealPlans : ingredientDrivenPlans).map((suggestion) => (
                        <li key={suggestion.id} className="activity-item">
                          <p><strong>{renderPlanTitle(suggestion)}</strong></p>
                          <p className="muted">
                            {suggestion.macroTotals.calories} kcal | P {suggestion.macroTotals.protein}g | C {suggestion.macroTotals.carbs}g | F {suggestion.macroTotals.fats}g | Fiber {suggestion.macroTotals.fiber}g
                          </p>
                          <p className="muted">Ingredients: {(suggestion.recipe?.ingredients || []).map(ingredientLine).join(', ')}</p>
                          {suggestion.recipe?.cookingSteps?.length ? (
                            <ul className="summary-list">
                              {suggestion.recipe.cookingSteps.slice(0, 4).map((step, stepIndex) => (
                                <li key={`${suggestion.id}-step-${stepIndex}`}>{step}</li>
                              ))}
                            </ul>
                          ) : null}
                          {suggestion.recipe?.whyThisFitsYourPlan || suggestion.rationale ? (
                            <p className="muted">{suggestion.recipe?.whyThisFitsYourPlan || suggestion.rationale}</p>
                          ) : null}
                          {suggestion.recipe?.youtubeLink ? (
                            <a className="button button-ghost" href={suggestion.recipe.youtubeLink} target="_blank" rel="noreferrer">
                              Watch on YouTube
                            </a>
                          ) : null}
                          {suggestion.allergyWarnings?.length ? (
                            <p className="allergy-warning">⚠️ {suggestion.allergyWarnings.join(' | ')}</p>
                          ) : null}
                          <button className="button button-ghost" onClick={() => handleAddSuggestionAsMeal(suggestion)}>
                            Add to Today's Intake
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No ingredient-based suggestions yet.</p>
                  )}
                </>
              ) : eatInMode === 'order' ? (
                ingredientDrivenPlans.length ? (
                  <ul className="activity-list">
                    {ingredientDrivenPlans.map((suggestion) => (
                      <li key={suggestion.id} className="activity-item">
                        <p><strong>{renderPlanTitle(suggestion)}</strong></p>
                        <p className="muted">
                          {suggestion.macroTotals.calories} kcal | P {suggestion.macroTotals.protein}g | C {suggestion.macroTotals.carbs}g | F {suggestion.macroTotals.fats}g | Fiber {suggestion.macroTotals.fiber}g
                        </p>
                        <p className="muted">Ingredients: {(suggestion.recipe?.ingredients || []).map(ingredientLine).join(', ')}</p>
                        <p className="muted">{suggestion.rationale}</p>
                        {suggestion.allergyWarnings?.length ? (
                          <p className="allergy-warning">⚠️ {suggestion.allergyWarnings.join(' | ')}</p>
                        ) : null}
                        {suggestion.grocerySuggestions?.length ? (
                          <ul className="summary-list">
                            {suggestion.grocerySuggestions.map((grocery, groceryIndex) => (
                              <li key={`${suggestion.id}-grocery-${groceryIndex}`}>
                                {grocery.ingredient}: {grocery.estimatedPrice} ({grocery.store}, {grocery.rating}★)
                                {grocery.allergyWarnings?.length ? ` - ⚠️ ${grocery.allergyWarnings.join(' | ')}` : ''}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {suggestion.recipe?.youtubeLink ? (
                          <a className="button button-ghost" href={suggestion.recipe.youtubeLink} target="_blank" rel="noreferrer">
                            Watch on YouTube
                          </a>
                        ) : null}
                        <div className="actions-grid">
                          <button className="button button-ghost" onClick={() => handleAddSuggestionAsMeal(suggestion)}>
                            Add to Today's Intake
                          </button>
                          {suggestion.grocerySuggestions?.[0] ? (
                            <a className="button button-ghost" href={suggestion.grocerySuggestions[0].buyLink} target="_blank" rel="noreferrer">
                              Buy on Walmart
                            </a>
                          ) : null}
                          {suggestion.grocerySuggestions?.[0] ? (
                            <a className="button button-ghost" href={suggestion.grocerySuggestions[0].viewLink} target="_blank" rel="noreferrer">
                              View on Google
                            </a>
                          ) : null}
                          {suggestion.grocerySuggestions?.[0] ? (
                            <a className="button button-ghost" href={suggestion.grocerySuggestions[0].viewLink} target="_blank" rel="noreferrer">
                              Pickup Ingredients
                            </a>
                          ) : null}
                          {suggestion.grocerySuggestions?.[0] ? (
                            <a className="button button-ghost" href={suggestion.grocerySuggestions[0].buyLink} target="_blank" rel="noreferrer">
                              Delivery Ingredients
                            </a>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No ingredient order suggestions available right now.</p>
                )
              ) : recipeSuggestions.length ? (
                <ul className="activity-list">
                  {recipeSuggestions.map((recipe) => (
                    <li key={recipe.id} className="activity-item">
                      <ImageWithFallback
                        src={recipe.imageUrl}
                        fallback={fallbackImage(recipe.recipeName || 'Recipe', 'Macro-fit Meal', 'food')}
                        alt={recipe.recipeName || 'Recipe'}
                        className="result-image"
                      />
                      <p><strong>{recipe.recipeName}</strong></p>
                      <p className="muted">{recipe.recommendationLabel}</p>
                      <p className="muted">
                        {recipe.estimatedMacros.calories} kcal | P {recipe.estimatedMacros.protein}g | C {recipe.estimatedMacros.carbs}g | F {recipe.estimatedMacros.fats}g
                      </p>
                      <p className="muted">Ingredients: {(recipe.ingredients || []).map(ingredientLine).join(', ')}</p>
                      {recipe.allergyNotes?.length ? (
                        <p className="allergy-warning">⚠️ {recipe.allergyNotes.join(' | ')}</p>
                      ) : null}
                      <div className="inline-actions">
                        <button className="button button-ghost" onClick={() => handleAddRecipeCardAsMeal(recipe)}>
                          Add to Today's Intake
                        </button>
                        {recipe.youtubeLink ? (
                          <a className="button button-ghost" href={recipe.youtubeLink} target="_blank" rel="noreferrer">
                            Watch Recipe on YouTube
                          </a>
                        ) : null}
                        <Link className="button button-ghost" to="/community">
                          Community Recipes
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No recipe suggestions available right now.</p>
              )}

            </div>
          ) : (
            <div className="sub-panel">
              <p className="helper-note">
                Upload a meal image/video to detect food, then resolve to nearby restaurants or a recipe fallback.
              </p>
              <div className="split-two">
                <div className="form">
                  <label className="field">
                    <span className="field-label">Latitude</span>
                    <input
                      className="field-control"
                      type="number"
                      step="any"
                      value={decisionLocation.lat}
                      onChange={(event) =>
                        setDecisionLocation((prev) => ({ ...prev, lat: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Longitude</span>
                    <input
                      className="field-control"
                      type="number"
                      step="any"
                      value={decisionLocation.lng}
                      onChange={(event) =>
                        setDecisionLocation((prev) => ({ ...prev, lng: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Radius (miles)</span>
                    <input
                      className="field-control"
                      type="number"
                      min="1"
                      max="20"
                      value={decisionLocation.radius}
                      onChange={(event) =>
                        setDecisionLocation((prev) => ({ ...prev, radius: event.target.value }))
                      }
                    />
                  </label>
                  <div className="inline-actions">
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => handleUseDecisionLocation()}
                      disabled={isLocatingDecision}
                    >
                      {isLocatingDecision ? 'Getting Location...' : 'Use My Location'}
                    </button>
                  </div>
                  <p className="helper-note">{locationStatus}</p>
                </div>
                <FoodScanPanel
                  lat={decisionLocation.lat}
                  lng={decisionLocation.lng}
                  radius={decisionLocation.radius}
                />
              </div>
                </div>
              )}
            </>
          ) : (
            <p className="muted">Recommendations are collapsed. Use Show to continue planning.</p>
          )}
        </article>

        <article className="sub-panel section-content collapsible-panel">
          <div className="collapse-header">
            <h2>Recommendations</h2>
            <button className="button button-ghost collapse-button" type="button" onClick={() => togglePanel('recommendations')}>
              {panelState.recommendations ? 'Hide' : 'Show'}
            </button>
          </div>
          {panelState.recommendations ? (
            <>
              <h3 id="dashboard-movies-section">Movies for You</h3>
              {isContentLoading ? (
                <p className="muted">Loading movie and show recommendations...</p>
              ) : movieRecommendations.length ? (
                <div className="content-reco-grid">
                  {movieRecommendations.map((item) => (
                    <MovieRecommendationCard
                      key={`dashboard-movie-${item.id}`}
                      item={item}
                      onFeedback={(contentItem, action) =>
                        handleContentFeedback(contentItem, action, contentItem.contextType || 'eat_in')
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="muted">
                  {contentError
                    ? `Content service unavailable: ${contentError}`
                    : 'No movie suggestions are available right now.'}
                </p>
              )}

              <h3 id="dashboard-songs-section">Songs for You</h3>
              {isContentLoading ? (
                <p className="muted">Loading song and playlist recommendations...</p>
              ) : songRecommendations.length ? (
                <div className="content-reco-grid">
                  {songRecommendations.map((item) => (
                    <SongRecommendationCard
                      key={`dashboard-song-${item.id}`}
                      item={item}
                      titlePrefix="Suggested Music for Your Day"
                      onFeedback={(contentItem, action) =>
                        handleContentFeedback(contentItem, action, contentItem.contextType || 'walking')
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="muted">
                  {contentError
                    ? `Content service unavailable: ${contentError}`
                    : 'No song suggestions are available right now.'}
                </p>
              )}
            </>
          ) : (
            <p className="muted">Recommendation cards are collapsed. Expand to view movies and songs.</p>
          )}
        </article>

        <article className="sub-panel collapsible-panel">
          <div className="collapse-header">
            <h2>Saved Items</h2>
            <button className="button button-ghost collapse-button" type="button" onClick={() => togglePanel('saved')}>
              {panelState.saved ? 'Hide' : 'Show'}
            </button>
          </div>
          {panelState.saved ? (
            <>
              {isSavedContentLoading ? (
                <p className="muted">Loading saved movies and songs...</p>
              ) : savedContent.length ? (
                <ul className="activity-list">
                  {savedContent.slice(0, 10).map((item) => (
                    <li key={`saved-content-${item.id || `${item.contentType}-${item.itemId}`}`} className="activity-item">
                      <p>
                        <strong>{item.title}</strong>{' '}
                        <span className="muted">({item.contentType === 'song' ? 'Song' : 'Movie/Show'})</span>
                      </p>
                      <p className="muted">
                        {item.artist ? `${item.artist} | ` : ''}
                        {item.genre || 'mixed genre'}
                        {item.confidencePct ? ` | Confidence ${Math.round(Number(item.confidencePct || 0))}%` : ''}
                      </p>
                      {item.reason ? <p className="muted">{item.reason}</p> : null}
                      <div className="inline-actions">
                        {item.sourceUrl ? (
                          <a className="button button-ghost" href={item.sourceUrl} target="_blank" rel="noreferrer">
                            Open Source
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Nothing saved yet. Use "Save for Later" on any recommendation card.</p>
              )}
            </>
          ) : (
            <p className="muted">Saved items are collapsed.</p>
          )}
        </article>

        {aiInsights ? (
          <article className="sub-panel section-ai collapsible-panel">
            <div className="collapse-header">
              <h2>Insights</h2>
              <button className="button button-ghost collapse-button" type="button" onClick={() => togglePanel('insights')}>
                {panelState.insights ? 'Hide' : 'Show'}
              </button>
            </div>
            {panelState.insights ? (
              <>
                <p className="recommendation-title">
                  {aiInsights.bestNextAction ||
                    aiInsights.predictedNextBestAction ||
                    'Best next meal: Balanced macro-friendly option'}
                </p>
                <p className="muted">
                  Why:{' '}
                  {aiInsights.whyThisWasRecommended ||
                    aiInsights.recommendationReason ||
                    recommendation?.message ||
                    'Chosen for strong fit with your remaining targets and preferences.'}
                </p>
                <p className="muted">
                  Behavior Insight:{' '}
                  {aiInsights.behaviorInsight ||
                    'Behavior profile is still building. Continue logging meals and activity for better personalization.'}
                </p>
                <p className="muted">
                  Anomaly Check:{' '}
                  {aiInsights.anomalyInsight || aiInsights.anomalyCheck || 'No unusual pattern detected today.'}
                </p>
                <p className="muted">Confidence: {aiInsights.confidencePct ?? 0}%</p>
                {contentLearning ? (
                  <p className="muted">
                    Learning: Accepted {contentLearning.acceptedItems || 0} | Ignored {contentLearning.ignoredItems || 0} |{' '}
                    {contentLearning.preferenceShift || 'Preference trend is stabilizing.'}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="muted">Insights are collapsed.</p>
            )}
          </article>
        ) : null}

        <article className="sub-panel section-calendar">
          <h2>Calendar</h2>
          <CalendarMonthView
            activeMonth={activeMonth}
            selectedDate={selectedDate}
            onSelectDate={handleDateSelect}
            onMonthChange={handleMonthChange}
            marksByDate={marksByDate}
          />
        </article>

        <article className="sub-panel section-selected-day collapsible-panel">
          <div className="collapse-header">
            <h2>{isFutureDate(selectedDate) ? 'Future Plan Details' : 'Selected Day Details'}</h2>
            <button className="button button-ghost collapse-button" type="button" onClick={() => togglePanel('history')}>
              {panelState.history ? 'Hide' : 'Show'}
            </button>
          </div>
          {panelState.history ? (
            <>
              {isDayLoading ? <p className="muted">Loading selected date details...</p> : null}

              {!isDayLoading && selectedDay ? (
                isFutureDate(selectedDate) ? (
              <div className="form">
                <p className="helper-note">{selectedDate}: Plan your calories for this future date.</p>
                <div className="split-three">
                  <label className="field">
                    <span className="field-label">Planned Intake (kcal)</span>
                    <input
                      className="field-control"
                      type="number"
                      min="800"
                      max="8000"
                      value={plannedCalories}
                      onChange={(event) => setPlannedCalories(event.target.value)}
                      placeholder="e.g. 3000"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Plan Note / Event</span>
                    <input
                      className="field-control"
                      type="text"
                      maxLength="180"
                      value={planNote}
                      onChange={(event) => setPlanNote(event.target.value)}
                      placeholder="Party, travel, celebration..."
                    />
                  </label>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={isCheatDay}
                      onChange={(event) => setIsCheatDay(event.target.checked)}
                    />
                    <span>Mark as cheat day</span>
                  </label>
                </div>
                <div className="inline-actions">
                  <button className="button button-align-end" onClick={handleSavePlan} disabled={isSavingPlan}>
                    {isSavingPlan ? 'Saving Plan...' : 'Change Plan'}
                  </button>
                  {!selectedDay.plan ? <span className="muted">No plan yet for this date. Create one now.</span> : null}
                </div>

                {selectedDay.plan?.expectedExtraCalories > 0 ? (
                  <div className="recommendation-box">
                    <p className="recommendation-title">Weekly Balance Suggestion</p>
                    <p>
                      You planned +{selectedDay.plan.expectedExtraCalories} kcal on {selectedDate}. Reduce about {selectedDay.plan.reductionPerDay} kcal/day for {selectedDay.plan.planningWindowDays} day(s) to balance.
                    </p>
                    <ul className="summary-list">
                      {(selectedDay.plan.suggestions || []).map((text, index) => (
                        <li key={`${selectedDay.plan.id || selectedDate}-${index}`}>{text}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {selectedDay.plan?.note ? (
                  <p className="helper-note">Event note: {selectedDay.plan.note}</p>
                ) : null}
              </div>
                ) : (
              <div className="split-two">
                <div>
                  <ul className="summary-list">
                    <li>Calories Consumed: {selectedDay.summary.caloriesConsumed} kcal</li>
                    <li>Calories Burned: {selectedDay.summary.caloriesBurned} kcal</li>
                    <li>Net Calories: {selectedDay.summary.netIntake} kcal</li>
                    <li>Protein: {selectedDay.summary.protein} g</li>
                    <li>Carbs: {selectedDay.summary.carbs} g</li>
                    <li>Fats: {selectedDay.summary.fats} g</li>
                    <li>Fiber: {selectedDay.summary.fiber} g</li>
                    <li>Exercises Logged: {selectedDay.summary.exerciseCount || 0}</li>
                    <li>Steps: {selectedDay.summary.steps || 0}</li>
                    <li>Entry Mode: {selectedIsToday ? 'Editable (today only)' : 'Locked (past day)'}</li>
                  </ul>
                </div>
                <div>
                  <p className="muted"><strong>Meals Logged</strong>: {selectedDay.meals?.length || 0}</p>
                  <ul className="activity-list">
                    {(selectedDay.meals || []).slice(0, 8).map((meal) => (
                      <li key={meal.id} className="activity-item">
                        <p><strong>{meal.foodName}</strong> ({meal.calories} kcal)</p>
                        <p className="muted">
                          P {meal.protein}g | C {meal.carbs}g | F {meal.fats}g | Fiber {meal.fiber}g | Portion {meal.portion || 1}x
                        </p>
                        <div className="inline-actions">
                          <button
                            className="button button-ghost"
                            type="button"
                            onClick={() => handleStartMealEdit(meal)}
                            disabled={!selectedIsToday}
                            title={!selectedIsToday ? 'Past entries cannot be modified' : 'Edit meal'}
                          >
                            Edit
                          </button>
                          <button
                            className="button button-ghost"
                            type="button"
                            onClick={() => handleDeleteMealEntry(meal)}
                            disabled={!selectedIsToday}
                            title={!selectedIsToday ? 'Past entries cannot be modified' : 'Delete meal'}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="muted"><strong>Exercises Logged</strong>: {selectedDay.exercises?.length || 0}</p>
                  <ul className="activity-list">
                    {(selectedDay.exercises || []).slice(0, 8).map((session) => (
                      <li key={session.id} className="activity-item">
                        <p><strong>{session.workoutType}</strong> ({session.caloriesBurned} kcal)</p>
                        <p className="muted">{session.steps || 0} steps | {formatDate(session.createdAt)}</p>
                        <div className="inline-actions">
                          <button
                            className="button button-ghost"
                            type="button"
                            onClick={() => handleStartExerciseEdit(session)}
                            disabled={!selectedIsToday}
                            title={!selectedIsToday ? 'Past entries cannot be modified' : 'Edit exercise'}
                          >
                            Edit
                          </button>
                          <button
                            className="button button-ghost"
                            type="button"
                            onClick={() => handleDeleteExerciseEntry(session)}
                            disabled={!selectedIsToday}
                            title={!selectedIsToday ? 'Past entries cannot be modified' : 'Delete exercise'}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {selectedIsPast ? (
                    <p className="helper-note">Past entries cannot be modified.</p>
                  ) : null}
                </div>
              </div>
                )
              ) : null}
              <div className="inline-actions">
                <Link className="button button-ghost" to="/history">
                  Open Full History
                </Link>
              </div>
            </>
          ) : (
            <p className="muted">Selected-day history is collapsed.</p>
          )}
        </article>

        {!isFutureDate(selectedDate) ? (
          <article className="sub-panel section-share-day">
            <h2>Share This Day</h2>
            <p className="muted">Share your calorie + macro summary, meals, and exercises via email.</p>
            <div className="form">
              <div className="split-two">
                <label className="field">
                  <span className="field-label">Recipient Email</span>
                  <input
                    className="field-control"
                    type="email"
                    value={shareEmail}
                    onChange={(event) => setShareEmail(event.target.value)}
                    placeholder="friend@example.com"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Message (optional)</span>
                  <input
                    className="field-control"
                    type="text"
                    maxLength="260"
                    value={shareMessage}
                    onChange={(event) => setShareMessage(event.target.value)}
                    placeholder="Sharing my ContextFit day snapshot"
                  />
                </label>
              </div>
              <button className="button" type="button" onClick={handleShareSelectedDay} disabled={isSharingDay}>
                {isSharingDay ? 'Sending...' : 'Share via Email'}
              </button>
            </div>
          </article>
        ) : null}

        {editingMeal ? (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <article className="modal-card">
              <h3>Edit Meal (Today Only)</h3>
              <div className="split-three">
                <FieldInput
                  label="Calories"
                  type="number"
                  min="0"
                  value={editingMeal.calories}
                  onChange={(event) =>
                    setEditingMeal((prev) => ({ ...prev, calories: event.target.value }))
                  }
                />
                <FieldInput
                  label="Protein (g)"
                  type="number"
                  min="0"
                  value={editingMeal.protein}
                  onChange={(event) =>
                    setEditingMeal((prev) => ({ ...prev, protein: event.target.value }))
                  }
                />
                <FieldInput
                  label="Carbs (g)"
                  type="number"
                  min="0"
                  value={editingMeal.carbs}
                  onChange={(event) =>
                    setEditingMeal((prev) => ({ ...prev, carbs: event.target.value }))
                  }
                />
              </div>
              <div className="split-three">
                <FieldInput
                  label="Fats (g)"
                  type="number"
                  min="0"
                  value={editingMeal.fats}
                  onChange={(event) =>
                    setEditingMeal((prev) => ({ ...prev, fats: event.target.value }))
                  }
                />
                <FieldInput
                  label="Fiber (g)"
                  type="number"
                  min="0"
                  value={editingMeal.fiber}
                  onChange={(event) =>
                    setEditingMeal((prev) => ({ ...prev, fiber: event.target.value }))
                  }
                />
                <FieldInput
                  label="Portion"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={editingMeal.portion}
                  onChange={(event) =>
                    setEditingMeal((prev) => ({ ...prev, portion: event.target.value }))
                  }
                />
              </div>
              <div className="inline-actions">
                <button className="button" type="button" onClick={handleSaveMealEdit}>
                  Save Meal
                </button>
                <button className="button button-ghost" type="button" onClick={() => setEditingMeal(null)}>
                  Cancel
                </button>
              </div>
            </article>
          </div>
        ) : null}

        {editingExercise ? (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <article className="modal-card">
              <h3>Edit Exercise (Today Only)</h3>
              <div className="split-two">
                <FieldInput
                  label="Workout Type"
                  type="text"
                  value={editingExercise.workoutType}
                  onChange={(event) =>
                    setEditingExercise((prev) => ({ ...prev, workoutType: event.target.value }))
                  }
                />
                <FieldInput
                  label="Exercise Name"
                  type="text"
                  value={editingExercise.exerciseName}
                  onChange={(event) =>
                    setEditingExercise((prev) => ({ ...prev, exerciseName: event.target.value }))
                  }
                />
              </div>
              <div className="split-three">
                <FieldInput
                  label="Sets"
                  type="number"
                  min="0"
                  value={editingExercise.sets}
                  onChange={(event) =>
                    setEditingExercise((prev) => ({ ...prev, sets: event.target.value }))
                  }
                />
                <FieldInput
                  label="Reps"
                  type="number"
                  min="0"
                  value={editingExercise.reps}
                  onChange={(event) =>
                    setEditingExercise((prev) => ({ ...prev, reps: event.target.value }))
                  }
                />
                <FieldInput
                  label="Weight (kg)"
                  type="number"
                  min="0"
                  value={editingExercise.weightKg}
                  onChange={(event) =>
                    setEditingExercise((prev) => ({ ...prev, weightKg: event.target.value }))
                  }
                />
              </div>
              <div className="split-three">
                <FieldInput
                  label="Duration (min)"
                  type="number"
                  min="0"
                  value={editingExercise.durationMinutes}
                  onChange={(event) =>
                    setEditingExercise((prev) => ({ ...prev, durationMinutes: event.target.value }))
                  }
                />
                <FieldInput
                  label="Body Weight (kg)"
                  type="number"
                  min="20"
                  value={editingExercise.bodyWeightKg}
                  onChange={(event) =>
                    setEditingExercise((prev) => ({ ...prev, bodyWeightKg: event.target.value }))
                  }
                />
                <FieldInput
                  label="Intensity"
                  as="select"
                  value={editingExercise.intensity}
                  onChange={(event) =>
                    setEditingExercise((prev) => ({ ...prev, intensity: event.target.value }))
                  }
                >
                  <option value="light">Light</option>
                  <option value="moderate">Moderate</option>
                  <option value="intense">Intense</option>
                  <option value="high">High</option>
                </FieldInput>
              </div>
              <div className="inline-actions">
                <button className="button" type="button" onClick={handleSaveExerciseEdit}>
                  Save Exercise
                </button>
                <button
                  className="button button-ghost"
                  type="button"
                  onClick={() => setEditingExercise(null)}
                >
                  Cancel
                </button>
              </div>
            </article>
          </div>
        ) : null}
      </article>
    </section>
  )
}
