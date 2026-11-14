import { expect, it } from 'vitest';
import { gearChoices } from './components/TodoGearInput';
it('prefix matches the correct type, puts owned first and deduplicates discovered names', () => {
 expect(gearChoices([{name:'Minolta XD',type:'camera'},{name:'Minolta lens',type:'lens'}],[{name:'Minolta XG',type:'camera'},{name:'minolta XD',type:'camera'},{name:'Other Minolta',type:'camera'}],'camera','Min')).toEqual([{name:'Minolta XD',group:'Owned gear'},{name:'Minolta XG',group:'Discovered gear'}]);
});
