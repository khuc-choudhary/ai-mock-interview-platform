import { motion } from 'framer-motion'

export type InterviewerStatus = 'listening' | 'thinking' | 'speaking'

/** Animated interviewer avatar: rings pulse and the mouth moves while speaking; dots appear while thinking. */
export default function InterviewerAvatar({ status, size = 150 }: { status: InterviewerStatus; size?: number }) {
  const speaking = status === 'speaking'
  const thinking = status === 'thinking'
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} aria-hidden>
      {speaking &&
        [0, 1].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full border border-brand-400/60"
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.45, opacity: 0 }}
            transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.9, ease: 'easeOut' }}
          />
        ))}
      <motion.div
        className="relative grid size-full place-items-center rounded-full bg-gradient-to-br from-brand-500 via-[#6b4a9c] to-sky-brand shadow-[0_0_45px_rgb(0_123_167/0.5)]"
        animate={{ scale: speaking ? [1, 1.025, 1] : 1 }}
        transition={{ duration: 0.9, repeat: speaking ? Infinity : 0 }}
      >
        <svg viewBox="0 0 100 100" width={size * 0.72} height={size * 0.72}>
          {/* eyes */}
          {[34, 66].map((x) => (
            <motion.ellipse
              key={x}
              cx={x}
              cy={42}
              rx={5}
              ry={6.5}
              fill="#fff"
              animate={{ scaleY: [1, 1, 1, 0.1, 1] }}
              style={{ transformOrigin: `${x}px 42px` }}
              transition={{ duration: 4, repeat: Infinity, times: [0, 0.45, 0.9, 0.94, 1] }}
            />
          ))}
          {/* mouth */}
          {thinking ? (
            [42, 50, 58].map((x, i) => (
              <motion.circle key={x} cx={x} cy={68} r={3} fill="#fff" animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />
            ))
          ) : (
            <motion.ellipse
              cx={50}
              cy={68}
              rx={speaking ? 9 : 11}
              fill="#fff"
              animate={{ ry: speaking ? [2, 7, 3, 8, 2.5] : 1.8 }}
              transition={{ duration: 0.55, repeat: speaking ? Infinity : 0 }}
            />
          )}
        </svg>
      </motion.div>
    </div>
  )
}
