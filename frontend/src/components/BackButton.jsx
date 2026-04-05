import { useNavigate } from 'react-router-dom'

export default function BackButton({ to = '/dashboard', label = 'Back' }) {
  const navigate = useNavigate()

  const handleClick = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }

    navigate(to)
  }

  return (
    <button className="button button-ghost back-button" type="button" onClick={handleClick}>
      {label}
    </button>
  )
}
