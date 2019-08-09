import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output,
  SimpleChanges, ViewEncapsulation
} from '@angular/core';
import { AbstractControl, FormControl, FormGroup } from '@angular/forms';

import { distinctUntilChanged, map } from 'rxjs/operators';

type DecimalChar = '.' | ',';

@Component({
  selector: 'amount-base-field',
  templateUrl: 'amount-base-field.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.Emulated,
})
export class AmountBaseFieldComponent implements OnChanges {
  @Input() integerLength = 10;
  @Input() decimalLength = 2;
  @Input() initValue?: number;
  @Input() isInvalid = false;
  @Input() decimalChar: DecimalChar = (navigator.language === 'en-US') ? '.' : ',';
  @Input() stopValue?: undefined | string;


  @Input() title?: string;
  @Input() placeholder?: string;
  @Input() currencyCode?: string;

  @Input() disabled?: boolean;

  @Output() updateValue = new EventEmitter<string>();
  // @Output() focus = new EventEmitter<string>();
  // @Output() blur = new EventEmitter<string>();

  get amount(): AbstractControl {
    return this.amountForm.get('amount');
  }

  amountForm = new FormGroup({
    amount: new FormControl(this.initValue)
  });

  private static replaceComma(value: string): string {
    return (typeof (value) === 'string') ? value.replace(',', '.') : value;
  }

  private static replaceDot(value: string): string {
    return (typeof (value) === 'string') ? value.replace('.', ',') : value;
  }

  private static replaceUnwantedCharacters(value: string, decimalChar: DecimalChar): string {
    return (decimalChar === ',')
      ? AmountBaseFieldComponent.replaceDot(value)
      : AmountBaseFieldComponent.replaceComma(value);
  }

  
  constructor() {
    this.amount.valueChanges
      .pipe(
        map(value => AmountBaseFieldComponent.replaceUnwantedCharacters(value, this.decimalChar)),
        map(value => this.transformValue(value))
      )
      .subscribe(value => {
        this.updateValue.emit(AmountBaseFieldComponent.replaceComma(String(value)));
      });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['initValue'] && changes['initValue'].currentValue !== undefined) {
      const initValue = AmountBaseFieldComponent.replaceComma(String(this.initValue));
      if (this.amount.value !== initValue) {
        this.amount.reset(initValue, {
          emitEvent: false
        });
      }
    }
  }

  changeValue(value) {
    this.amount.setValue(value);
  }
  onBlurCheckValue(value: string) {
    const newVal = this.transformValue(value);
    this.amount.reset(newVal);
  }

  private transformValue(value: string | number): string {
    value = value + '';
    const rgx = new RegExp('^\\d{0,' + this.integerLength + '}([\\.|\\,]\\d{0,' + this.decimalLength + '})?$');
    if (rgx.test(value)) {
      this.stopValue = value;
      return value;
    }

    return this.stopValue;
  }

}
