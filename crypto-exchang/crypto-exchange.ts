import { Component, ViewChild } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs/Subscription';
import Big from 'big.js';
import { map } from 'rxjs/operators';
import { forkJoin } from 'rxjs/observable/forkJoin';
import { TranslatePipe } from '@ngx-translate/core';

import { DataService } from '../../services/data.service';
import {
  AccountStatus,
  AccountType,
  CRYPTO_NAMES,
  // CryptoCurrencyCode,
  CryptoService,
  // CurrencyCode,
  ExchangeFee,
  IAccount,
  ICurrency
} from '../../services/crypto.service';
import { OrganizationService } from '../../services/organizations';
import { Account } from '../../services/accounts';
import { WheelComponent } from '../../components/wheel/wheel';
import { validateNonZero } from '../../validators/minmax';

const RoundingMode = {
  RoundDown: 0,
  RoundUp: 3,
};

interface IUIRate {
  id: string;
  title: string;
  shortTitle: string;
  ask: number;
  bid: number;
  baseRate: number;
  confirmDelay: number;
}

@IonicPage({
  priority: 'off'
})
@Component({
  selector: 'page-crypto-exchange',
  templateUrl: 'crypto-exchange.html',
  providers: [TranslatePipe]
})
export class CryptoExchangePage {
  isExchange = false;

  fees: ExchangeFee[];
  currencies: ICurrency[];
  type: 'buy' | 'sell';
  rates: IUIRate[];
  cryptoAccounts: IAccount[];
  fiatAccounts: IAccount[];
  exchangeForm: FormGroup;
  allAmount = false;

  private _exchangeFrom: string;
  private _exchangeTo: string;
  cryptoAccountsSubscription: Subscription;
  fiatAccountsSubscription: Subscription;
  rateSubscription: Subscription;
  feesSubscription: Subscription;
  allSubscription: Subscription;
  timeoutId: NodeJS.Timer;

  @ViewChild('fromSelect') fromSelect: WheelComponent;
  @ViewChild('toSelect') toSelect: WheelComponent;

  get loading() {
    return !this.cryptoAccounts.length || !this.fiatAccounts.length || !this.rates || !this.fees;
  }

  get cryptoRate() {
    const rateFrom = this.rates.find(a => a.shortTitle === this.selectedAccFrom.currency);
    const rateTo = this.rates.find(a => a.shortTitle === this.selectedAccTo.currency);

    return rateFrom || rateTo;
  }

  get fromBalance() {
    const acc = this.fiatAccounts.concat(this.cryptoAccounts).find(a => a.id === this.exchangeFrom);

    return acc ? acc.balance : '';
  }

  get toBalance() {
    const acc = this.fiatAccounts.concat(this.cryptoAccounts).find(a => a.id === this.exchangeTo);

    return acc ? acc.balance : '';
  }

  get minAmountFrom() {
    const c = this.fees.find(cr => cr.baseCurrency === this.selectedAccFrom.currency);

    return c ? c.min : 0;
  }

  get maxAmountFrom() {
    const curr = this.selectedAccFrom.currency;
    const b = this.selectedAccFrom.balance;
    const fee = this.fees.find(c => c.baseCurrency === curr);

    return fee ? (fee.max > b ? b : fee.max) : b;
  }

  get minAmountTo() {
    const c = this.fees && this.fees.find(({ baseCurrency }) => baseCurrency === this.selectedAccTo.currency);

    return c ? c.min : 0;
  }

  get maxAmountTo() {
    const c = this.fees && this.fees.find(({ baseCurrency }) => baseCurrency === this.selectedAccTo.currency);

    return c ? c.max : Infinity;
  }

  set exchangeFrom(value: string) {
    this._exchangeFrom = value;

    if (this._exchangeFrom === this._exchangeTo) {
      this._exchangeTo = this.toCurrencies[0].options[0].value;
    }
  }

  get exchangeFrom() {
    return this._exchangeFrom;
  }

  set exchangeTo(value: string) {
    this._exchangeTo = value;
  }

  get exchangeTo() {
    return this._exchangeTo;
  }

  get fromCurrencies() {
    let options;

    if (this.selectedAccFrom.currency !== 'EUR') {
      const availableCryptoForExchange = this.cryptoAccounts.filter(c => {
        return this.fees.find(f => {
          return f.baseCurrency === c.currency && f.quoteCurrency === this.selectedAccTo.currency;
        });
      });
      options = availableCryptoForExchange.map(c => {
        const text = this.translatePipe.transform('CryptoExchange.PayFrom.Account');
        return { value: c.id, text: `${text} (${c.currency})` };
      });
    } else {
      options = this.fiatAccounts.map(f => ({ value: f.id, text: f.id }));
    }

    return [{
      name: this.translatePipe.transform('CryptoExchange.PayFrom.SelectAccount'),
      options
    }];
  }

  get toCurrencies() {
    let options;

    if (this.selectedAccTo.currency !== 'EUR') {
      const availableCryptoForExchange = this.cryptoAccounts.filter(c => {
        return this.fees.find(f => {
          return f.baseCurrency === c.currency && f.quoteCurrency === this.selectedAccFrom.currency;
        });
      });
      options = availableCryptoForExchange.map(c => {
        const text = this.translatePipe.transform('CryptoExchange.ReceiveTo.Account');
        return { value: c.id, text: `${text} (${c.currency})` };
      });
    } else {
      options = this.fiatAccounts.map(f => ({ value: f.id, text: f.id }));
    }

    return [{
      name: this.translatePipe.transform('CryptoExchange.ReceiveTo.SelectAccount'),
      options
    }];
  }

  // for fees
  get selectedAccFrom(): IAccount {
    return this.fiatAccounts.concat(this.cryptoAccounts).find(a => a.id === this.exchangeFrom);
  }

  get selectedAccTo(): IAccount {
    return this.fiatAccounts.concat(this.cryptoAccounts).find(a => a.id === this.exchangeTo);
  }

  get selectedCurrTo() {
    const toCurrency = this.selectedAccTo.currency;

    return this.currencies.find(a => a.currency === toCurrency);
  }

  get selectedCurrFrom() {
    const fromCurrency = this.selectedAccFrom.currency;

    return this.currencies.find(a => a.currency === fromCurrency);
  }

  get from() {
    return this.exchangeForm.get('from');
  }

  get to() {
    return this.exchangeForm.get('to');
  }

  get maxAmountEUR() {
    const account = this.type === 'buy' ? this.selectedAccTo : this.selectedAccFrom;
    const fee: any = this.fees && this.fees.find(({ baseCurrency }) => baseCurrency === account.currency);

    return fee ? fee.maxEUR : 0;
  }

  get operationDisabled() {
    const account = this.type === 'buy' ? this.selectedAccTo : this.selectedAccFrom;
    const fee = this.fees && this.fees.find(({ baseCurrency }) => baseCurrency === account.currency);

    return fee ? fee.max < fee.min : true;
  }

  constructor(
    private navCtrl: NavController,
    private navParams: NavParams,
    private fb: FormBuilder,
    private dataService: DataService,
    private crypto: CryptoService,
    private organization: OrganizationService,
    private translatePipe: TranslatePipe
  ) {
    const fromAccountId = this.navParams.get('fromAccountId');
    const toAccountId = this.navParams.get('toAccountId');
    const fromAmount = this.navParams.get('fromAmount');
    const toAmount = this.navParams.get('toAmount');
    const type = this.navParams.get('type');
    const rates = this.navParams.get('rates');
    // const cryptoAccounts = this.navParams.get('cryptoAccounts');
    // const fiatAccounts = this.navParams.get('fiatAccounts');
    const currencies = this.navParams.get('currencies');

    this.exchangeForm = this.fb.group({
      from: [fromAmount || ''],
      to: [toAmount || '']
    });

    this._exchangeFrom = fromAccountId;
    this._exchangeTo = toAccountId;

    this.rates = rates;
    this.type = type;
    this.fiatAccounts = [];
    this.cryptoAccounts = [];
    this.currencies = currencies;
  }

  ionViewDidEnter() {
    const orgs$ = this.organization.getOrganization();
    const fees$ = this.crypto.getFees('exchange');
    const crypto$ = this.crypto.getUserAccounts(true);
    const rates$ = this.crypto.watchRates(['BTC', 'ETH', 'LTC', 'DASH']);

    this.fiatAccountsSubscription = orgs$
      .pipe(
        map(organization => organization[0].accounts)
      )
      .subscribe((fiatAccounts: Account[]) => {
        fiatAccounts.forEach(f => {
          this.fiatAccounts.push({
            id: f.id,
            balance: f.availableBalance,
            currency: f.currency.code,
            type: AccountType.BankClient,
            name: CRYPTO_NAMES[f.currency.code],
            crypto: false,
            status: f.status === 'ACTIVE' ? AccountStatus.Active : AccountStatus.Inactive
          });
        });
      });

    this.feesSubscription = fees$
      .subscribe({
        next: fees => {
          this.fees = fees as ExchangeFee[];
        },
        error: err => {
          throw err;
        }
      });

    this.cryptoAccountsSubscription = crypto$
      .subscribe({
        next: accs => {
          this.cryptoAccounts = accs;
          this.updateUserAccounts();
        },
        error: e => {
          this.updateUserAccounts();
        }
      });

    this.rateSubscription = rates$// remove stub
      .subscribe(rates => {
        const currencies = [];

        rates.forEach(r => {
          const c: IUIRate = {
            id: r.rateId,
            title: CRYPTO_NAMES[r.baseCurrency],
            shortTitle: r.baseCurrency,
            ask: r.askFee,
            bid: r.bidFee,
            baseRate: r.rate,
            confirmDelay: r.confirmDelay
          };

          currencies.push(c);
        });

        this.rates = currencies;
        if (Number(this.from.value) && Number(this.to.value)) {
          if (this.type === 'buy') {
            this.toValueChange(this.to.value);
          } else {
            this.fromValueChange(this.from.value);
          }
        }
      });

    this.allSubscription = forkJoin(orgs$, fees$, crypto$, rates$.take(1))
      .subscribe({
        error: (err) => {
          throw err;
        },
        complete: () => {
          if (this.from.value) {
            this.fromValueChange(this.from.value);
          } else if (this.to.value) {
            this.toValueChange(this.to.value);
          }
          this.setFieldValidators();
        }
      });
  }

  ionViewWillLeave() {
    clearTimeout(this.timeoutId);
    this.rateSubscription.unsubscribe();
    this.fiatAccountsSubscription.unsubscribe();
    this.feesSubscription.unsubscribe();
    this.cryptoAccountsSubscription.unsubscribe();
    this.allSubscription.unsubscribe();
  }

  setFieldValidators() {
    const fromValidators = [
      Validators.required,
      Validators.pattern('^[0-9]*(\.[0-9]+)?')
    ];
    const toValidators = [
      Validators.required,
      Validators.pattern('^[0-9]*(\.[0-9]+)?')
    ];

    if (this.selectedAccFrom.currency !== 'EUR') {
      fromValidators.push(Validators.min(this.minAmountFrom), Validators.max(this.maxAmountFrom));
      toValidators.push(Validators.max(this.maxAmountEUR));
    } else {
      toValidators.push(Validators.min(this.minAmountTo), Validators.max(this.maxAmountTo));
      fromValidators.push(validateNonZero(), Validators.max(this.maxAmountEUR), Validators.max(this.selectedAccFrom.balance));
    }

    this.from.setValidators(fromValidators);
    this.to.setValidators(toValidators);
  }

  selectAllAmount() {
    const balance = this.selectedAccFrom.balance.toString();

    this.allAmount = !this.allAmount;
    this.from.setValue(balance, {
      emitModelToViewChange: true
    });
    this.fromValueChange(balance);
  }

  getCurrencyFormat(currency: string) {
    return currency === 'EUR' ? '1.2-2' : '1.6-6';
  }

  updateUserAccounts() {
    this.cryptoAccountsSubscription.unsubscribe();
    this.fiatAccountsSubscription.unsubscribe();

    const cryptoAccs$ = this.crypto.getUserAccounts(true);
    const fiatAccs$ = this.organization.getOrganization();

    this.fiatAccountsSubscription = fiatAccs$
      .pipe(
        map(organization => organization[0].accounts)
      )
      .subscribe((fiatAccounts: Account[]) => {
        this.fiatAccounts = fiatAccounts.map(f => {
          return {
            id: f.id,
            balance: f.availableBalance,
            currency: f.currency.code,
            type: AccountType.BankClient,
            name: CRYPTO_NAMES[f.currency.code],
            crypto: false,
            status: f.status === 'ACTIVE' ? AccountStatus.Active : AccountStatus.Inactive
          };
        });
      });

    this.cryptoAccountsSubscription = cryptoAccs$
      .subscribe({
        next: accs => {
          this.cryptoAccounts = accs;
        },
        error: e => {
          throw e;
        }
      });

    this.timeoutId = setTimeout(() => {
      forkJoin(cryptoAccs$, fiatAccs$)
        .subscribe({
          next: () => {
            this.updateUserAccounts();
          },
          error: () => {
            this.updateUserAccounts();
          }
        });
    }, 5000);
  }

  updateFromAmount(val) {
    this.from.setValue(val);
    this.from.markAsDirty();
    this.fromValueChange(val);
  }

  updateToAmount(val) {
    this.to.setValue(val);
    this.to.markAsDirty();
    this.toValueChange(val);
  }

  fromCurrencyChange() {
    this.fromValueChange(this.from.value, Boolean(this.from.value));
    this.setFieldValidators();

    if (this.from.value) {
      this.from.updateValueAndValidity();
    }
  }

  toCurrencyChange() {
    this.toValueChange(this.to.value, Boolean(this.to.value));
    this.setFieldValidators();

    if (this.to.value) {
      this.to.updateValueAndValidity();
    }
  }

  openConfirm() {
    Object.keys(this.exchangeForm.controls).forEach(field => {
      const control = this.exchangeForm.controls[field];

      control.updateValueAndValidity();
    });

    if (this.exchangeForm.invalid) {
      Object.keys(this.exchangeForm.controls).forEach(field => {
        const control = this.exchangeForm.controls[field];

        control.markAsDirty();
      });
      return;
    }

    const exchangeType = (this.type === 'buy') ? 'BUY' : 'SELL';
    const fiatAcc = this.type === 'buy' ? this.selectedAccFrom : this.selectedAccTo;

    this.isExchange = true;
    this.crypto.convertBalance({
      fiatAccount: fiatAcc.id,
      exchangeType,
      amountFrom: this.from.value,
      amountTo: this.to.value,
      rateId: this.cryptoRate.id
    })
      .subscribe(
        ({ confirmation }) => {
          const rate = this.cryptoRate;
          this.isExchange = false;
          this.navCtrl.push('CryptoConfirmPage', {
            operationType: 'exchange',
            confirmation,
            exchangeType: this.type.toUpperCase(),
            rate: this.type === 'buy' ? rate.ask : rate.bid,
            rateId: rate.id,
            fiatAccount: fiatAcc.id,
            baseRate: rate.baseRate,
            balanceFrom: this.fromBalance,
            balanceTo: this.toBalance,
            amountFrom: this.from.value,
            amountTo: this.to.value,
            currencyFrom: this.selectedAccFrom.currency,
            currencyTo: this.selectedAccTo.currency,
            confirmDelay: rate.confirmDelay
          });
        },
        error => {
          this.isExchange = false;
          this.navCtrl.push('CryptoErrorPage', error.error['data']);
        });
  }

  fromValueChange(amount: string, validate = true) {
    if (!amount) {
      this.to.setValue('');
    }

    if (amount && !isNaN(Number(amount))) {
      this.calcAmount('to', parseFloat(amount));
    }

    if (validate) {
      this.to.markAsDirty();
    }
  }

  toValueChange(amount: string, validate = true) {
    if (!amount) {
      this.from.setValue('');
    }

    if (amount && !isNaN(Number(amount))) {
      this.calcAmount('from', parseFloat(amount));
    }

    if (validate) {
      this.from.markAsDirty();
    }
  }

  changeDirection() {
    let freezedValue: string;

    if (this.selectedCurrFrom.currency !== 'EUR') {
      freezedValue = this.from.value;
      this.to.setValue(freezedValue);
    } else {
      freezedValue = this.to.value;
      this.from.setValue(freezedValue);
    }

    const exchangeFrom = this.exchangeFrom;
    const shouldValidate = this.to.value || this.to.value;

    this._exchangeFrom = this.exchangeTo;
    this._exchangeTo = exchangeFrom;
    this.type = this.type === 'buy' ? 'sell' : 'buy';

    this.setFieldValidators();
    if (this.type === 'buy') {
      this.toValueChange(freezedValue, shouldValidate);
    } else {
      this.fromValueChange(freezedValue, shouldValidate);
    }
  }

  calcAmount(field: string, amount: number) {
    const rate = this.rates.find(r => r.shortTitle === this.selectedAccTo.currency) ||
      this.rates.find(r => r.shortTitle === this.selectedAccFrom.currency);

    switch (field) {
      case 'from': {
        let val: string;

        if (this.selectedAccTo.currency !== 'EUR') {
          val = Big(rate.ask)
            .times(amount)
            .round(this.selectedCurrFrom.significantDigits, RoundingMode.RoundUp)
            .toString();
        } else {
          val = Big(amount)
            .div(rate.bid)
            .round(this.selectedCurrFrom.significantDigits, RoundingMode.RoundUp)
            .toString();
        }
        this.from.setValue(val);
        break;
      }
      case 'to': {
        let val: string;

        if (this.selectedAccFrom.currency !== 'EUR') {
          val = Big(rate.bid)
            .times(amount)
            .round(this.selectedCurrTo.significantDigits, RoundingMode.RoundDown)
            .toString();
        } else {
          val = Big(amount)
            .div(rate.ask)
            .round(this.selectedCurrTo.significantDigits, RoundingMode.RoundDown)
            .toString();
        }
        this.to.setValue(val);
        break;
      }
    }
  }

  openCurrencies(dir: 'from' | 'to') {
    this[dir + 'Select'].open();
  }

  showTouchedError(val: string): void {
    this.exchangeForm.get(val).markAsTouched();
  }
}
