import { Availability } from '../models/Availability.js';
import { validateAvailabilityInput } from '../validators/index.js';
import { getAvailability, markPlanStale } from '../services/planStore.js';

export async function getMyAvailability(req, res) {
  res.json({ availability: await getAvailability(req.userId) });
}

export async function saveMyAvailability(req, res) {
  const data = validateAvailabilityInput(req.body);
  const availability = await Availability.findOneAndUpdate(
    { userId: req.userId },
    { $set: data, $setOnInsert: { userId: req.userId } },
    { returnDocument: 'after', upsert: true, runValidators: true }
  ).lean();
  await markPlanStale(req.userId);
  res.json({ availability: { ...availability, configured: true } });
}
