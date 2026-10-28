import { IconAlert } from '@/shared/icons';

/** Shown instead of an endless skeleton when a screen has nothing cached and there is no connection. */
export function OfflineNoData() {
  return (
    <div className="state" role="status">
      <span className="state__icon">
        <IconAlert size={30} />
      </span>
      <h2>Sin datos en este dispositivo</h2>
      <p>
        Esta pantalla todavía no se cargó en este dispositivo. Conéctese a internet una vez para poder usarla sin
        conexión.
      </p>
    </div>
  );
}
