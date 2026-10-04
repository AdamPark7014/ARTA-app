import { crossedMilestone, soldPct } from './ticketing-sync.service';

describe('Boletera · hitos de venta para avisar', () => {
  it('porcentaje vendido solo cuenta zonas con aforo y no pasa del aforo', () => {
    expect(soldPct([{ aforo: 100, sold: 50 }, { aforo: 0, sold: 30 }])).toBe(50);
    expect(soldPct([{ aforo: 10, sold: 25 }])).toBe(100);
    expect(soldPct([])).toBe(0);
  });

  it('avisa solo el hito más alto que se cruzó', () => {
    expect(crossedMilestone(40, 55)).toBe(50);
    expect(crossedMilestone(40, 95)).toBe(90);
    expect(crossedMilestone(92, 100)).toBe(100);
    expect(crossedMilestone(55, 60)).toBeNull();
    expect(crossedMilestone(100, 100)).toBeNull();
  });
});
