import { NgModule } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { IonicPageModule } from 'ionic-angular';
import { CryptoExchangePage } from './crypto-exchange';
import { ComponentsModule } from '../../components/components.module';
import { ValidatorsModule } from '../../validators/validators.module';
import { PipesModule } from '../../pipes/pipes.module';

@NgModule({
  declarations: [
    CryptoExchangePage,
  ],
  imports: [
    ComponentsModule,
    ValidatorsModule,
    PipesModule,
    IonicPageModule.forChild(CryptoExchangePage),
    TranslateModule
  ],
})
export class CryptoExchangePageModule {}
