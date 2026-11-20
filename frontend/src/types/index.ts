export type Category = 'technical' | 'hr' | 'communication' | 'mixed'
export type Experience = 'fresher' | '0-2' | '2-5' | 'experienced'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type Language = 'English' | 'Hindi' | 'Hinglish'
export type Verdict = 'correct' | 'partially_correct' | 'incorrect' | 'irrelevant' | 'unclear'

export interface Profile {
  education: string | null
  experience_level: Experience
  preferred_role: string | null
  skills: string[]
  daily_goal: number
  timezone: string
}
export interface User {
  id: string
  email: string
  full_name: string
  created_at: string
  profile: Profile
}
export interface TokenResponse {
  access_token: string
  user: User
}

export interface Meta {
  ai_mode: 'live' | 'demo'
  llm_model: string | null
  whisper_available: boolean
  interviewer_name: string
  technical_topics: string[]
  hr_topics: string[]
  communication_topics: string[]
  demo_notice: string | null
}

export interface InterviewConfig {
  category: Category
  topic: string | null
  job_role: string
  experience_level: Experience
  difficulty: Difficulty
  duration_minutes: 10 | 15 | 30 | 45
  num_questions: number
  language: Language
}

export interface Evaluation {
  verdict: Verdict
  technical_accuracy: number
  relevance: number
  conceptual_understanding: number
  completeness: number
  communication_clarity: number
  grammar: number
  vocabulary: number
  confidence_indicators: number
  structure: number
  overall_score: number
  fluency_score: number | null
  words_per_minute: number | null
  filler_count: number
  filler_words: Record<string, number>
  feedback: string
  mistakes: string[]
  suggestions: string[]
  missed_concepts: string[]
  improved_answer: string | null
  model_answer: string | null
  simple_explanation: string | null
  topic: string | null
  ai_mode: 'live' | 'demo'
}
export interface Answer {
  id: string
  text: string
  input_method: 'voice' | 'typed'
  word_count: number
  submitted_at: string
  evaluation: Evaluation | null
}
export interface Question {
  id: string
  order_index: number
  text: string
  lead_in: string | null
  kind: 'main' | 'followup'
  topic: string | null
  answer?: Answer | null
}
export interface SessionSummary {
  id: string
  category: Category
  topic: string | null
  job_role: string
  experience_level: Experience
  difficulty: Difficulty
  duration_minutes: number
  num_questions: number
  language: Language
  status: 'in_progress' | 'completed' | 'abandoned'
  ended_early: boolean
  ai_mode: 'live' | 'demo'
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  overall_score: number | null
  technical_score: number | null
  communication_score: number | null
  fluency_score: number | null
}
export interface SessionDetail extends SessionSummary {
  greeting: string | null
  introduction: string | null
  is_paused: boolean
  elapsed_seconds: number
  interviewer_name: string
  questions: Question[]
}
export interface SpeechMetrics {
  recording_seconds: number
  speaking_seconds: number
  pause_count: number
  long_pause_count: number
  longest_pause_seconds: number
}
export interface SubmitResponse {
  evaluation: Evaluation
  answered_count: number
  target_count: number
  limit_reached: boolean
}

export interface TopicStat {
  topic: string
  avg: number
  count: number
}
export interface CommunicationAgg {
  fluency: number | null
  grammar: number
  vocabulary: number
  clarity: number
  structure: number
  confidence_language: number
  avg_wpm: number | null
  pace: 'slow' | 'good' | 'fast' | null
  filler_count: number
  top_fillers: Record<string, number>
  long_pauses: number
  voice_answers: number
  typed_answers: number
  tips: string[]
}
export interface Plan {
  summary: string
  topics_to_study: { topic: string; reason: string; how_to_study: string }[]
  communication_exercises: string[]
  recommended_practice: string[]
  next_goals: string[]
}
export interface QuestionAnalysis {
  order: number
  question: string
  kind: string
  topic: string | null
  answer: string
  input_method: string
  verdict: Verdict
  score: number
  feedback: string
  mistakes: string[]
  suggestions: string[]
  improved_answer: string | null
  model_answer: string | null
  simple_explanation: string | null
  scores: Record<string, number>
  fluency_score: number | null
  words_per_minute: number | null
  filler_count: number
}
export interface Report {
  session: {
    id: string
    category: Category
    topic: string | null
    job_role: string
    experience_level: string
    difficulty: string
    language: string
    duration_seconds: number | null
    started_at: string
    ended_at: string | null
    ended_early: boolean
  }
  ai_mode: 'live' | 'demo'
  plan_source: 'ai' | 'rule_based' | 'demo'
  demo_notice: string | null
  generated_at: string
  aggregates: {
    overall_score: number
    status: string
    answered: number
    planned: number
    verdict_counts: Record<Verdict, number>
    technical_score: number
    communication_score: number
    fluency_score: number | null
    criteria: Record<string, number>
    topic_stats: TopicStat[]
    strong_topics: TopicStat[]
    weak_topics: TopicStat[]
    concepts_to_revise: { concept: string; count: number }[]
    communication: CommunicationAgg
  }
  plan: Plan
  questions: QuestionAnalysis[]
}

export interface Dashboard {
  total_interviews: number
  avg_score: number | null
  technical_score: number | null
  communication_score: number | null
  fluency_score: number | null
  trend: { date: string; score: number; technical: number | null; communication: number | null }[]
  recent: { id: string; job_role: string; category: Category; topic: string | null; overall_score: number; ended_at: string; difficulty: string; ai_mode: string }[]
  recommended: { type: 'topic' | 'skill'; name: string; score: number; hint: string }[]
  daily_goal: number
  completed_today: number
  streak_days: number
}
export interface Analytics {
  total_interviews: number
  total_answers: number
  series: { session_id: string; date: string; label: string; overall: number; technical: number | null; communication: number | null; fluency: number | null }[]
  improvement: { first_avg: number; latest_avg: number; change_points: number; change_percent: number | null; window: number } | null
  topic_performance: TopicStat[]
  criteria_performance: { key: string; label: string; avg: number }[]
  weekly_activity: { date: string; interviews: number; questions: number; minutes: number }[]
  repeated_mistakes: { concept: string; count: number; topic: string }[]
  top_fillers: { word: string; count: number }[]
  verdicts: Record<string, number>
  strongest: TopicStat[]
  weakest: TopicStat[]
  strongest_skills: { key: string; label: string; avg: number }[]
  weakest_skills: { key: string; label: string; avg: number }[]
}
export interface Learning {
  weak_topics: TopicStat[]
  weak_skills: { key: string; label: string; avg: number }[]
  plans: {
    session_id: string
    job_role: string
    date: string
    ai_mode: string
    plan_source: string
    plan: Partial<Plan>
    concepts_to_revise: { concept: string; count: number }[]
  }[]
}
export interface HistoryPage {
  items: SessionSummary[]
  total: number
}
