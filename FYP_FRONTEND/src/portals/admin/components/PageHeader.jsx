function PageHeader({ title, description, actions }) {
  return (
    <header className="page-header">
      <div>
        <h2 className="page-header__title">{title}</h2>
        {description && <p className="page-header__desc">{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  )
}

export default PageHeader
