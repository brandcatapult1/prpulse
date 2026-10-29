import { useEffect, useState } from 'react';
import { Drawer } from '../ui/Primitives.jsx';
import { VisitCaptureForm } from './VisitCaptureForm.jsx';
import { emptyVisitFields } from '../../lib/visitFields.js';

/** Side drawer for visit capture (replaces VisitModal). */
export function VisitDrawer({
  open,
  onClose,
  contactName,
  outletName,
  title,
  saveLabel = 'Save visit',
  intro,
  initialValues,
  onSave,
}) {
  const [fields, setFields] = useState(initialValues ?? emptyVisitFields());
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (open) {
      setFields(initialValues ?? emptyVisitFields());
      setTried(false);
    }
  }, [open, initialValues]);

  const drawerTitle = title ?? `Plan visit · ${contactName}`;

  return (
    <Drawer
      open={open}
      title={drawerTitle}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setTried(true);
              if (fields.visitDate) onSave(fields);
            }}
          >
            {saveLabel}
          </button>
        </div>
      }
    >
      {intro && (
        <p className="mb-4 text-2xs text-ink-secondary">{intro}</p>
      )}
      <VisitCaptureForm
        outletName={outletName}
        value={fields}
        onChange={setFields}
        showErrors={tried}
      />
    </Drawer>
  );
}
