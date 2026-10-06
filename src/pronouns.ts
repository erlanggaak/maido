import type { Gender } from './types';

/** Pronouns for UI copy about a character ("How Kira sees herself", "Talk with him"). */
export function pronouns(gender: Gender = 'female') {
  return gender === 'male'
    ? { they: 'he', them: 'him', their: 'his', themselves: 'himself', They: 'He', Their: 'His' }
    : { they: 'she', them: 'her', their: 'her', themselves: 'herself', They: 'She', Their: 'Her' };
}
export const GENDER_LABEL: Record<Gender, string> = {
  female: 'Female (she/her)',
  male: 'Male (he/him)',
};
