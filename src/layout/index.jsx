import React from 'react';

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function Container({
  children,
  className,
  size = 'xl',
  paddingY = true,
  ...props
}) {
  const maxWidth =
    size === 'md'
      ? 'max-w-4xl'
      : size === 'lg'
        ? 'max-w-[1250px]'
        : 'max-w-[1450px]';

  return (
    <div
      className={cx(
        'mx-auto w-full',
        maxWidth,
        'px-2 sm:px-6 lg:px-8',
        paddingY ? 'py-6 sm:py-8' : null,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export default function Layout({
  children,
  className,
  containerClassName,
  containerSize,
  ...props
}) {
  return (
    <div className={cx('min-h-screen bg-slate-50 text-slate-900', className)} {...props}>
      <Container className={containerClassName} size={containerSize}>
        {children}
      </Container>
    </div>
  );
}

