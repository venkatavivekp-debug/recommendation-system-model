export default function FieldInput({
  label,
  required = false,
  error,
  as = 'input',
  className = '',
  ...props
}) {
  const Component = as

  return (
    <label className={`field ${className}`.trim()}>
      <span className="field-label">
        {label}
        {required ? <em className="required-marker">*</em> : null}
      </span>
      <Component className={`field-control ${error ? 'field-control-error' : ''}`} {...props} />
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  )
}
