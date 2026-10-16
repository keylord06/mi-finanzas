import { TestBed } from '@angular/core/testing';
import { Movimientos } from './movimientos';

describe('Movimientos', () => {
  let service: Movimientos;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Movimientos);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
