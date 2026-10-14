import './Button.css'

/** variant: primary (gold) | secondary (navy outline) | ghost | link */
function Button({
  children,
  variant = 'primary',
  type = 'button',
  loading = false,
  disabled = false,
  fullWidth = false,
  className = '',
  ...rest
}) {
  const classes = ['btn', `btn--${variant}`, fullWidth && 'btn--full', className]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading} {...rest}>
      {loading && <span className="btn__spinner" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  )
}

export default Button
