import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { getDb, seedDatabase } from './server/db.js';
import {
  getMikrotikConfig,
  saveMikrotikConfig,
  getRouterResources,
  getRouterInterfaces,
  getRouterSecrets,
  getRouterActiveSessions,
  getRouterDhcpLeases,
  deleteDhcpLease,
  toggleSubscriberInternet,
  batchSyncSubscribersToRouter,
  toggleVlanInterface,
  checkAndDisableOverdueVlans,
  syncRouterTime,
  syncVlanInterfaceComment,
  syncAllVlanComments,
} from './server/mikrotik.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize SQLite DB
  const db = await getDb();

  // --- API ROUTES ---

  // Get full dataset
  app.get('/api/data', async (req, res) => {
    try {
      const subscribers = await db.all('SELECT * FROM subscribers ORDER BY dueDay ASC, id ASC');
      const payments = await db.all('SELECT * FROM payments ORDER BY rowid DESC');
      const expenses = await db.all('SELECT * FROM expenses ORDER BY date DESC, rowid DESC');
      res.json({ subscribers, payments, expenses });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Subscribers API
  app.get('/api/subscribers', async (req, res) => {
    try {
      const subscribers = await db.all('SELECT * FROM subscribers ORDER BY dueDay ASC, id ASC');
      res.json(subscribers);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/subscribers', async (req, res) => {
    try {
      const sub = req.body;
      if (!sub.id) {
        return res.status(400).json({ error: 'Subscriber ID is required' });
      }

      const existing = await db.get('SELECT * FROM subscribers WHERE id = ?', [sub.id]);
      const oldVlan = existing && existing.vlan ? Number(existing.vlan) : null;

      if (existing) {
        await db.run(
          `UPDATE subscribers SET last = ?, first = ?, dueRaw = ?, dueDay = ?, status = ?, vlan = ?, rate = ?, phone = ?, address = ?, notes = ? WHERE id = ?`,
          [
            sub.last,
            sub.first,
            sub.dueRaw || null,
            sub.dueDay !== undefined ? sub.dueDay : null,
            sub.status || 'Active',
            sub.vlan !== undefined ? sub.vlan : null,
            sub.rate || 600,
            sub.phone || '',
            sub.address || '',
            sub.notes || '',
            sub.id,
          ]
        );
      } else {
        await db.run(
          `INSERT INTO subscribers (id, last, first, dueRaw, dueDay, status, vlan, rate, phone, address, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sub.id,
            sub.last,
            sub.first,
            sub.dueRaw || null,
            sub.dueDay !== undefined ? sub.dueDay : null,
            sub.status || 'Active',
            sub.vlan !== undefined ? sub.vlan : null,
            sub.rate || 600,
            sub.phone || '',
            sub.address || '',
            sub.notes || '',
          ]
        );
      }

      const updatedSub = await db.get('SELECT * FROM subscribers WHERE id = ?', [sub.id]);

      // Sync RouterOS VLAN comment for old VLAN if changed
      const newVlan = updatedSub.vlan !== null && updatedSub.vlan !== undefined ? Number(updatedSub.vlan) : null;
      if (oldVlan && oldVlan !== newVlan) {
        const remainingOld = await db.all('SELECT * FROM subscribers WHERE vlan = ?', [oldVlan]);
        const oldComment = remainingOld.map((s: any) => `${s.first} ${s.last}`.trim()).filter(Boolean).join(', ');
        syncVlanInterfaceComment(db, oldVlan, oldComment).catch(() => {});
      }

      // Sync RouterOS VLAN comment for new VLAN
      if (newVlan && newVlan > 0) {
        const remainingNew = await db.all('SELECT * FROM subscribers WHERE vlan = ?', [newVlan]);
        const newComment = remainingNew.map((s: any) => `${s.first} ${s.last}`.trim()).filter(Boolean).join(', ');
        syncVlanInterfaceComment(db, newVlan, newComment).catch(() => {});
      }

      res.json(updatedSub);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/subscribers/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const existingSub = await db.get('SELECT * FROM subscribers WHERE id = ?', [id]);
      const delVlan = existingSub && existingSub.vlan ? Number(existingSub.vlan) : null;

      await db.run('DELETE FROM subscribers WHERE id = ?', [id]);

      if (delVlan && delVlan > 0) {
        const remaining = await db.all('SELECT * FROM subscribers WHERE vlan = ?', [delVlan]);
        const remComment = remaining.map((s: any) => `${s.first} ${s.last}`.trim()).filter(Boolean).join(', ');
        syncVlanInterfaceComment(db, delVlan, remComment).catch(() => {});
      }

      res.json({ success: true, id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Payments API
  app.get('/api/payments', async (req, res) => {
    try {
      const payments = await db.all('SELECT * FROM payments ORDER BY rowid DESC');
      res.json(payments);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/payments', async (req, res) => {
    try {
      const payment = req.body;
      const pId = payment.id || `pay-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const ts = payment.ts || new Date().toLocaleString();

      await db.run(
        `INSERT INTO payments (id, ts, sub, month, amount, method, referenceNo, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pId,
          ts,
          payment.sub,
          payment.month,
          payment.amount,
          payment.method || 'Cash',
          payment.referenceNo || '',
          payment.note || '',
        ]
      );

      const newPayment = await db.get('SELECT * FROM payments WHERE id = ?', [pId]);
      res.json(newPayment);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/payments/:id', async (req, res) => {
    try {
      await db.run('DELETE FROM payments WHERE id = ?', [req.params.id]);
      res.json({ success: true, id: req.params.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Expenses API
  app.get('/api/expenses', async (req, res) => {
    try {
      const expenses = await db.all('SELECT * FROM expenses ORDER BY date DESC, rowid DESC');
      res.json(expenses);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/expenses', async (req, res) => {
    try {
      const exp = req.body;
      const id = exp.id || `exp-${Date.now()}`;

      const existing = await db.get('SELECT id FROM expenses WHERE id = ?', [id]);
      if (existing) {
        await db.run(
          `UPDATE expenses SET itemName = ?, unitPrice = ?, quantity = ?, totalPrice = ?, date = ?, month = ?, category = ?, note = ? WHERE id = ?`,
          [
            exp.itemName,
            exp.unitPrice,
            exp.quantity,
            exp.totalPrice,
            exp.date,
            exp.month,
            exp.category || '',
            exp.note || '',
            id,
          ]
        );
      } else {
        await db.run(
          `INSERT INTO expenses (id, itemName, unitPrice, quantity, totalPrice, date, month, category, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            exp.itemName,
            exp.unitPrice,
            exp.quantity,
            exp.totalPrice,
            exp.date,
            exp.month,
            exp.category || '',
            exp.note || '',
          ]
        );
      }

      const updatedExp = await db.get('SELECT * FROM expenses WHERE id = ?', [id]);
      res.json(updatedExp);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/expenses/:id', async (req, res) => {
    try {
      await db.run('DELETE FROM expenses WHERE id = ?', [req.params.id]);
      res.json({ success: true, id: req.params.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reset API
  app.post('/api/reset', async (req, res) => {
    try {
      await seedDatabase(db);
      const subscribers = await db.all('SELECT * FROM subscribers ORDER BY dueDay ASC, id ASC');
      const payments = await db.all('SELECT * FROM payments ORDER BY rowid DESC');
      const expenses = await db.all('SELECT * FROM expenses ORDER BY date DESC, rowid DESC');
      res.json({ success: true, subscribers, payments, expenses });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- MIKROTIK ROUTEROS API ---
  app.get('/api/mikrotik/config', async (req, res) => {
    try {
      const cfg = getMikrotikConfig(db);
      res.json(cfg);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mikrotik/config', async (req, res) => {
    try {
      const cfg = saveMikrotikConfig(db, req.body);
      res.json({ success: true, config: cfg });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mikrotik/sync-time', async (req, res) => {
    try {
      const result = await syncRouterTime(db);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/mikrotik/resources', async (req, res) => {
    try {
      const subscribers = await db.all('SELECT * FROM subscribers');
      const result = await getRouterResources(db, subscribers);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/mikrotik/interfaces', async (req, res) => {
    try {
      const subscribers = await db.all('SELECT * FROM subscribers');
      const result = await getRouterInterfaces(db, subscribers);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/mikrotik/secrets', async (req, res) => {
    try {
      const subscribers = await db.all('SELECT * FROM subscribers');
      const result = await getRouterSecrets(db, subscribers);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/mikrotik/active', async (req, res) => {
    try {
      const subscribers = await db.all('SELECT * FROM subscribers');
      const result = await getRouterActiveSessions(db, subscribers);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/mikrotik/leases', async (req, res) => {
    try {
      const subscribers = await db.all('SELECT * FROM subscribers');
      const result = await getRouterDhcpLeases(db, subscribers);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mikrotik/delete-lease', async (req, res) => {
    try {
      const { leaseId, macAddress } = req.body;
      if (!leaseId && !macAddress) {
        return res.status(400).json({ error: 'leaseId or macAddress is required' });
      }
      const result = await deleteDhcpLease(db, leaseId, macAddress);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mikrotik/toggle-user', async (req, res) => {
    try {
      const { subId, disable } = req.body;
      const subscribers = await db.all('SELECT * FROM subscribers');
      const result = await toggleSubscriberInternet(db, Number(subId), Boolean(disable), subscribers);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mikrotik/toggle-vlan', async (req, res) => {
    try {
      const { vlan, disable } = req.body;
      if (!vlan && vlan !== 0) {
        return res.status(400).json({ error: 'VLAN ID is required' });
      }
      const subscribers = await db.all('SELECT * FROM subscribers');
      const result = await toggleVlanInterface(db, vlan, Boolean(disable), subscribers);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mikrotik/batch-sync', async (req, res) => {
    try {
      const subscribers = await db.all('SELECT * FROM subscribers');
      const payments = await db.all('SELECT * FROM payments');

      // helper to compute status
      const computeStatus = (sub: any) => {
        if (sub.status === 'Inactive') return 'inactive';
        const subPayments = payments.filter((p: any) => p.sub === sub.id);
        const monthsPaid = new Set(subPayments.map((p: any) => p.month));

        const now = new Date();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const currentMonthStr = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

        if (!monthsPaid.has(currentMonthStr)) {
          let dueDay = sub.dueDay || 15;
          if (sub.dueRaw) {
            const p = new Date(sub.dueRaw);
            if (!isNaN(p.getTime())) dueDay = p.getDate();
          }
          if (now.getDate() > dueDay) return 'overdue';
          if (now.getDate() === dueDay) return 'due';
        }
        return 'active';
      };

      const result = await batchSyncSubscribersToRouter(db, subscribers, computeStatus);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Check Overdue Subscribers and automatically disable their VLAN interfaces
  app.post('/api/mikrotik/check-overdue', async (req, res) => {
    try {
      const result = await checkAndDisableOverdueVlans(db);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sync all subscriber full names to MikroTik VLAN interface comments
  app.post('/api/mikrotik/sync-vlan-comments', async (req, res) => {
    try {
      const result = await syncAllVlanComments(db);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update a single RouterOS VLAN interface comment
  app.post('/api/mikrotik/update-vlan-comment', async (req, res) => {
    try {
      const { vlan, comment } = req.body;
      if (!vlan && vlan !== 0) {
        return res.status(400).json({ error: 'VLAN ID is required' });
      }
      const result = await syncVlanInterfaceComment(db, vlan, comment || '');
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Setup Daily 4:00 AM Cron Schedule to automatically check overdues and disable VLAN interfaces
  function schedule4AMOverdueCheck() {
    function getMsUntilNext4AM() {
      const now = new Date();
      const next4AM = new Date(now);
      next4AM.setHours(4, 0, 0, 0);
      if (now.getTime() >= next4AM.getTime()) {
        next4AM.setDate(next4AM.getDate() + 1);
      }
      return next4AM.getTime() - now.getTime();
    }

    function runAndReschedule() {
      console.log('[Automated 4 AM Cron] Running scheduled daily check for overdue subscribers...');
      checkAndDisableOverdueVlans(db)
        .then((res) => {
          console.log('[Automated 4 AM Cron] Successfully processed overdue VLAN interfaces:', JSON.stringify(res));
        })
        .catch((err) => {
          console.error('[Automated 4 AM Cron] Error during check:', err);
        })
        .finally(() => {
          const msNext = getMsUntilNext4AM();
          console.log(`[Automated 4 AM Cron] Next execution scheduled in ${(msNext / 3600000).toFixed(2)} hours.`);
          setTimeout(runAndReschedule, msNext);
        });
    }

    const initialMs = getMsUntilNext4AM();
    console.log(`[Automated 4 AM Cron] Scheduler active. Next 4:00 AM check scheduled in ${(initialMs / 3600000).toFixed(2)} hours.`);
    setTimeout(runAndReschedule, initialMs);
  }

  schedule4AMOverdueCheck();


  // --- VITE MIDDLEWARE / PRODUCTION STATIC ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
