function toDateKey(dateValue) {
  return new Date(dateValue).toISOString().slice(0, 10)
}

function monthTitle(date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function weekdayLabels() {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
}

function buildCalendarCells(activeMonth) {
  const firstDay = new Date(activeMonth.getFullYear(), activeMonth.getMonth(), 1)
  const start = new Date(firstDay)
  start.setDate(firstDay.getDate() - firstDay.getDay())

  const cells = []
  for (let index = 0; index < 42; index += 1) {
    const cellDate = new Date(start)
    cellDate.setDate(start.getDate() + index)
    cells.push({
      date: cellDate,
      dateKey: toDateKey(cellDate),
      dayNumber: cellDate.getDate(),
      isOutsideMonth: cellDate.getMonth() !== activeMonth.getMonth(),
    })
  }

  return cells
}

export default function CalendarMonthView({
  activeMonth,
  selectedDate,
  onSelectDate,
  onMonthChange,
  marksByDate = {},
  className = '',
}) {
  const cells = buildCalendarCells(activeMonth)
  const cardClassName = ['sub-panel', className].filter(Boolean).join(' ')

  return (
    <article className={cardClassName}>
      <div className="calendar-header">
        <h2>Calendar Planner</h2>
        <div className="inline-actions">
          <button className="button button-ghost" type="button" onClick={() => onMonthChange(-1)}>
            Previous
          </button>
          <p className="calendar-title">{monthTitle(activeMonth)}</p>
          <button className="button button-ghost" type="button" onClick={() => onMonthChange(1)}>
            Next
          </button>
        </div>
      </div>

      <div className="calendar-weekdays">
        {weekdayLabels().map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="calendar-grid">
        {cells.map((cell) => {
          const marks = marksByDate[cell.dateKey] || {}
          const classes = [
            'calendar-day',
            cell.isOutsideMonth ? 'calendar-day-outside' : '',
            selectedDate === cell.dateKey ? 'calendar-day-selected' : '',
            marks.isToday ? 'calendar-day-today' : '',
            marks.hasHistory ? 'calendar-day-history' : '',
            marks.hasPlan ? 'calendar-day-planned' : '',
            marks.isCheatDay ? 'calendar-day-cheat' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              key={cell.dateKey}
              className={classes}
              type="button"
              onClick={() => onSelectDate(cell.dateKey)}
            >
              <span>{cell.dayNumber}</span>
              <span className="calendar-indicators">
                {marks.hasHistory ? <i className="indicator indicator-history" title="History" /> : null}
                {marks.hasPlan ? <i className="indicator indicator-plan" title="Planned" /> : null}
                {marks.isCheatDay ? <i className="indicator indicator-cheat" title="Cheat Day" /> : null}
              </span>
            </button>
          )
        })}
      </div>

      <div className="calendar-legend">
        <span><i className="indicator indicator-history" /> History</span>
        <span><i className="indicator indicator-plan" /> Planned</span>
        <span><i className="indicator indicator-cheat" /> Cheat Day</span>
      </div>
    </article>
  )
}
